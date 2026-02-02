"""
Airflow DAG: Discover New Words from Chat Messages
自動發現《後宮甄嬛傳》直播留言中的新詞彙、梗、錯別字

使用 Gemini API 分析留言，找出：
- 新的諧音梗和變體詞彙
- 常見的錯別字（需要替換）
- 需要特別處理的特殊詞彙

執行頻率：每 2-3 小時一次
API: gemini-2.5-flash-lite (10 RPM, 250K TPM, 20 RPD)
"""

from datetime import datetime, timedelta
import os
import json
from typing import List, Dict, Any
import uuid

from airflow import DAG
from airflow.models import Variable
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
import google.generativeai as genai
from word_discovery_logic import filter_and_validate_words, format_transformation_summary

# 默認參數
default_args = {
    'owner': 'hermes',
    'depends_on_past': False,
    'start_date': datetime(2025, 1, 2),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

# DAG 定義
dag = DAG(
    'discover_new_words',
    default_args=default_args,
    description='Discover new words, memes, and typos from chat messages using Gemini API',
    schedule_interval='0 */3 * * *',  # 每 3 小時執行一次
    catchup=False,
    tags=['text-analysis', 'ai', 'gemini', 'discovery'],
)


def create_tables_if_not_exists(**context):
    """
    Task 0: 創建詞彙發現相關的資料表（如果不存在）
    """
    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    create_tables_sql = """
    -- 待審核的替換詞彙表
    CREATE TABLE IF NOT EXISTS pending_replace_words (
        id SERIAL PRIMARY KEY,
        source_word VARCHAR(255) NOT NULL,
        target_word VARCHAR(255) NOT NULL,
        confidence_score DECIMAL(3,2),
        occurrence_count INTEGER DEFAULT 1,
        example_messages TEXT[],
        discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by VARCHAR(100),
        notes TEXT,
        UNIQUE(source_word, target_word)
    );

    -- 待審核的特殊詞彙表
    CREATE TABLE IF NOT EXISTS pending_special_words (
        id SERIAL PRIMARY KEY,
        word VARCHAR(255) NOT NULL UNIQUE,
        confidence_score DECIMAL(3,2),
        occurrence_count INTEGER DEFAULT 1,
        example_messages TEXT[],
        word_type VARCHAR(50),
        discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'pending',
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by VARCHAR(100),
        notes TEXT
    );

    -- 詞彙分析執行記錄
    CREATE TABLE IF NOT EXISTS word_analysis_log (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(100) NOT NULL,
        analysis_start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        analysis_end_time TIMESTAMP WITH TIME ZONE,
        messages_analyzed INTEGER DEFAULT 0,
        new_replace_words_found INTEGER DEFAULT 0,
        new_special_words_found INTEGER DEFAULT 0,
        api_calls_made INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'running',
        error_message TEXT,
        execution_time_seconds INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 已分析留言追蹤表
    CREATE TABLE IF NOT EXISTS word_analysis_checkpoint (
        id SERIAL PRIMARY KEY,
        last_analyzed_message_id VARCHAR(255),
        last_analyzed_timestamp TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 創建索引
    CREATE INDEX IF NOT EXISTS idx_pending_replace_status ON pending_replace_words(status);
    CREATE INDEX IF NOT EXISTS idx_pending_replace_discovered ON pending_replace_words(discovered_at);
    CREATE INDEX IF NOT EXISTS idx_pending_special_status ON pending_special_words(status);
    CREATE INDEX IF NOT EXISTS idx_pending_special_discovered ON pending_special_words(discovered_at);
    CREATE INDEX IF NOT EXISTS idx_word_analysis_log_run_id ON word_analysis_log(run_id);
    CREATE INDEX IF NOT EXISTS idx_word_analysis_log_status ON word_analysis_log(status);
    """

    pg_hook.run(create_tables_sql)

    # 初始化 checkpoint（如果不存在）
    init_checkpoint_sql = """
        INSERT INTO word_analysis_checkpoint (last_analyzed_timestamp)
        SELECT NOW() - INTERVAL '3 hours'
        WHERE NOT EXISTS (SELECT 1 FROM word_analysis_checkpoint);
    """
    pg_hook.run(init_checkpoint_sql)

    print("Tables created or already exist")
    return {'status': 'success'}


def initialize_analysis(**context):
    """
    Task 1: 初始化分析任務
    創建執行記錄和生成 run_id
    """
    run_id = f"word_discovery_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    # 創建分析記錄
    insert_log_sql = """
        INSERT INTO word_analysis_log (run_id, analysis_start_time, status)
        VALUES (%s, %s, 'running')
        RETURNING id;
    """

    result = pg_hook.get_first(insert_log_sql, parameters=(run_id, datetime.now()))
    log_id = result[0] if result else None

    print(f"Analysis initialized: {run_id} (log_id: {log_id})")

    # 推送到 XCom
    context['task_instance'].xcom_push(key='run_id', value=run_id)
    context['task_instance'].xcom_push(key='log_id', value=log_id)

    return {
        'run_id': run_id,
        'log_id': log_id,
        'start_time': datetime.now().isoformat()
    }


def fetch_new_messages(**context):
    """
    Task 2: 獲取檢查點時間
    從上次分析的檢查點開始並計算待處理留言數量
    """
    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    # 獲取上次分析的時間點
    checkpoint_sql = """
        SELECT last_analyzed_timestamp
        FROM word_analysis_checkpoint
        ORDER BY updated_at DESC
        LIMIT 1;
    """

    result = pg_hook.get_first(checkpoint_sql)
    last_analyzed_time = result[0] if result else datetime.now() - timedelta(hours=3)

    print(f"Checkpoint time: {last_analyzed_time}")

    # 計算待處理留言數量（不拉取完整資料）
    count_sql = """
        SELECT COUNT(*)
        FROM chat_messages
        WHERE published_at > %s
        AND live_stream_id = (
            SELECT live_stream_id
            FROM chat_messages
            ORDER BY published_at DESC
            LIMIT 1
        );
    """
    count_result = pg_hook.get_first(count_sql, parameters=(last_analyzed_time,))
    message_count = count_result[0] if count_result else 0

    print(f"Found {message_count} new messages since checkpoint")

    # 只推送檢查點時間（輕量級）
    context['task_instance'].xcom_push(key='last_analyzed_time', value=last_analyzed_time.isoformat())
    context['task_instance'].xcom_push(key='message_count', value=message_count)

    return {
        'count': message_count,
        'last_analyzed_time': last_analyzed_time.isoformat()
    }


def load_existing_dictionaries(**context):
    """
    Task 3: 載入現有字典
    載入所有已存在的詞彙，用於去重和驗證
    """
    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    # 載入所有替換詞彙（source 和 target）
    replace_sql = """
        SELECT source_word, target_word FROM replace_words;
    """
    replace_records = pg_hook.get_records(replace_sql)

    # 載入所有特殊詞彙
    special_sql = """
        SELECT word FROM special_words;
    """
    special_records = pg_hook.get_records(special_sql)

    # 整理成集合和映射
    existing_replace_sources = set([r[0] for r in replace_records])
    existing_replace_targets = set([r[1] for r in replace_records])
    existing_special_words = set([r[0] for r in special_records])

    # 建立 source -> target 映射，用於查找已存在的替換規則
    replace_mapping = {r[0]: r[1] for r in replace_records}

    # 所有不可被 replace 的詞（包括 target_word 和 special_words）
    protected_words = existing_replace_targets | existing_special_words

    dictionaries = {
        'replace_sources': list(existing_replace_sources),
        'replace_targets': list(existing_replace_targets),
        'special_words': list(existing_special_words),
        'protected_words': list(protected_words),
        'replace_mapping': replace_mapping  # 新增：source -> target 映射
    }

    print(f"Loaded existing dictionaries:")
    print(f"  - Replace sources: {len(existing_replace_sources)}")
    print(f"  - Replace targets: {len(existing_replace_targets)}")
    print(f"  - Special words: {len(existing_special_words)}")
    print(f"  - Protected words (cannot be replaced): {len(protected_words)}")
    print(f"  - Replace mappings: {len(replace_mapping)}")

    # 推送到 XCom
    context['task_instance'].xcom_push(key='dictionaries', value=dictionaries)

    return dictionaries


def analyze_with_gemini(**context):
    """
    Task 4: 使用 Gemini API 分析留言
    找出新的詞彙、棗、錯別字
    
    優化：直接查詢資料庫獲取留言，避免通過 XCom 傳遞大量資料
    """
    # 獲取檢查點時間和字典
    last_analyzed_time_str = context['task_instance'].xcom_pull(task_ids='fetch_new_messages', key='last_analyzed_time')
    message_count = context['task_instance'].xcom_pull(task_ids='fetch_new_messages', key='message_count')
    dictionaries = context['task_instance'].xcom_pull(task_ids='load_existing_dictionaries', key='dictionaries')

    if not message_count or message_count == 0:
        print("No new messages to analyze")
        context['task_instance'].xcom_push(key='analysis_result', value={'replace_words': [], 'special_words': []})
        context['task_instance'].xcom_push(key='last_message_info', value=None)
        return {'analyzed': 0, 'new_words': []}

    # 解析檢查點時間
    last_analyzed_time = datetime.fromisoformat(last_analyzed_time_str)

    # 直接從資料庫獲取留言（避免 XCom 大量資料傳遞）
    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')
    fetch_messages_sql = """
        SELECT message_id, message, author_name, published_at
        FROM chat_messages
        WHERE published_at > %s
        AND live_stream_id = (
            SELECT live_stream_id
            FROM chat_messages
            ORDER BY published_at DESC
            LIMIT 1
        )
        ORDER BY published_at ASC
        LIMIT 2000;
    """
    messages = pg_hook.get_records(fetch_messages_sql, parameters=(last_analyzed_time,))
    
    messages_data = []
    for msg in messages:
        messages_data.append({
            'message_id': msg[0],
            'message': msg[1],
            'author_name': msg[2],
            'published_at': msg[3].isoformat() if msg[3] else None
        })

    if not messages_data:
        print("No messages fetched")
        context['task_instance'].xcom_push(key='analysis_result', value={'replace_words': [], 'special_words': []})
        context['task_instance'].xcom_push(key='last_message_info', value=None)
        return {'analyzed': 0, 'new_words': []}

    print(f"Fetched {len(messages_data)} messages for analysis")

    # 設定 Gemini API
    api_key = Variable.get("GEMINI_API_KEY", default_var=os.getenv('GEMINI_API_KEY'))
    
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in Airflow Variables or Environment Variables")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-2.5-flash-lite')

    # 準備提示詞
    messages_text = "\n".join([f"{i+1}. {msg['message']}" for i, msg in enumerate(messages_data[:500])])

    # 準備現有字典摘要
    existing_replace_examples = dictionaries['replace_sources'][:20]
    existing_special_examples = dictionaries['special_words'][:30]

    # 預設提示詞
    default_prompt = f"""
你是一個專門分析網路直播留言的助手。請分析以下留言，找出：

1. **錯別字和變體詞彙**：需要替換成標準詞彙的錯字或諧音
2. **特殊詞彙**：新出現的梗、角色名、網路用語等需要保留的詞彙

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{existing_replace_examples_str}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{existing_special_examples_str}}...（共 {{special_count}} 個）

**重要規則**：
1. 不要建議已存在的詞彙
2. 替換後的標準詞彙（target）必須是準確、完整的詞
3. 特殊詞彙只建議新發現的梗或重要詞彙

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{{
  "replace_words": [
    {{
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.95,
      "examples": ["範例留言1", "範例留言2"],
      "reason": "簡短說明"
    }}
  ],
  "special_words": [
    {{
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.90,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }}
  ]
}}

注意事項：
1. 只回報**新發現**的詞彙，避免重複現有字典
2. confidence 分數範圍 0.0-1.0，只回報 >= 0.7 的詞彙
3. 每個詞彙提供 1-3 個範例留言
4. 確保 target（替換後的詞）是正確且完整的標準詞彙
"""

    # 從 Airflow Variable 獲取 Prompt
    prompt_template = Variable.get("DISCOVER_NEW_WORDS_PROMPT", default_var=default_prompt)

    # 填充模板變數
    prompt = prompt_template.replace("{existing_replace_examples_str}", ', '.join(existing_replace_examples[:10])) \
                             .replace("{replace_count}", str(len(dictionaries['replace_sources']))) \
                             .replace("{existing_special_examples_str}", ', '.join(existing_special_examples[:15])) \
                             .replace("{special_count}", str(len(dictionaries['special_words']))) \
                             .replace("{messages_text}", messages_text)

    try:
        # 呼叫 Gemini API
        response = model.generate_content(prompt)
        response_text = response.text

        # 清理 JSON
        if response_text.startswith('```json'):
            response_text = response_text[7:]
        if response_text.endswith('```'):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        # 解析 JSON
        analysis_result = json.loads(response_text)

        print(f"API Response parsed successfully")
        print(f"Found {len(analysis_result.get('replace_words', []))} replace words")
        print(f"Found {len(analysis_result.get('special_words', []))} special words")

        # 推送分析結果和最後一條留言資訊（用於更新 checkpoint）
        context['task_instance'].xcom_push(key='analysis_result', value=analysis_result)
        context['task_instance'].xcom_push(key='api_calls', value=1)
        context['task_instance'].xcom_push(key='last_message_info', value={
            'message_id': messages_data[-1]['message_id'],
            'published_at': messages_data[-1]['published_at']
        })
        context['task_instance'].xcom_push(key='messages_analyzed_count', value=len(messages_data))

        return {
            'analyzed': len(messages_data),
            'replace_words_found': len(analysis_result.get('replace_words', [])),
            'special_words_found': len(analysis_result.get('special_words', []))
        }

    except Exception as e:
        print(f"Error calling Gemini API: {str(e)}")
        raise


def filter_and_validate(**context):
    """
    Task 5: 過濾和驗證發現的詞彙
    使用經過測試驗證的邏輯模組
    """
    analysis_result = context['task_instance'].xcom_pull(task_ids='analyze_with_gemini', key='analysis_result')
    dictionaries = context['task_instance'].xcom_pull(task_ids='load_existing_dictionaries', key='dictionaries')

    if not analysis_result:
        print("No analysis result to filter")
        return {'filtered_replace': [], 'filtered_special': [], 'auto_special': []}

    # 使用測試驗證過的邏輯模組
    filtered_replace, filtered_special = filter_and_validate_words(
        gemini_replace_words=analysis_result.get('replace_words', []),
        gemini_special_words=analysis_result.get('special_words', []),
        existing_replace_mapping=dictionaries['replace_mapping'],
        existing_special_words=set(dictionaries['special_words'])
    )

    # 統計
    auto_special_count = sum(1 for item in filtered_special if item.get('_auto_added', False))
    manual_special_count = len(filtered_special) - auto_special_count

    print(f"Filtering results:")
    print(f"  - Replace words: {len(analysis_result.get('replace_words', []))} -> {len(filtered_replace)}")
    print(f"  - Special words: {len(analysis_result.get('special_words', []))} -> {manual_special_count}")
    print(f"  - Auto-added special words (from targets): {auto_special_count}")

    # 顯示轉換摘要
    print("\n" + format_transformation_summary(filtered_replace, filtered_special))

    # 推送到 XCom
    context['task_instance'].xcom_push(key='filtered_replace', value=filtered_replace)
    context['task_instance'].xcom_push(key='filtered_special', value=filtered_special)

    return {
        'filtered_replace_count': len(filtered_replace),
        'filtered_special_count': manual_special_count,
        'auto_special_count': auto_special_count
    }


def save_discoveries(**context):
    """
    Task 6: 儲存過濾後的詞彙到待審核表
    """
    filtered_replace = context['task_instance'].xcom_pull(task_ids='filter_and_validate', key='filtered_replace')
    filtered_special = context['task_instance'].xcom_pull(task_ids='filter_and_validate', key='filtered_special')

    if not filtered_replace and not filtered_special:
        print("No filtered results to save")
        return {'saved': 0}

    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    saved_count = 0

    # 儲存替換詞彙
    for item in filtered_replace:
        # 計算近 7 天該 source_word 的實際出現次數（在當前直播）
        count_sql = """
            SELECT COUNT(*) 
            FROM chat_messages 
            WHERE message LIKE %s
            AND published_at > NOW() - INTERVAL '7 days'
            AND live_stream_id = (
                SELECT live_stream_id
                FROM chat_messages
                ORDER BY published_at DESC
                LIMIT 1
            )
        """
        like_pattern = f"%{item['source']}%"
        result = pg_hook.get_first(count_sql, parameters=(like_pattern,))
        occurrence_count_7d = result[0] if result else 0
        
        print(f"Replace word '{item['source']}' → '{item['target']}': {occurrence_count_7d} occurrences in last 7 days")
        
        upsert_sql = """
            INSERT INTO pending_replace_words
                (source_word, target_word, confidence_score, example_messages, occurrence_count)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (source_word, target_word)
            DO UPDATE SET
                occurrence_count = EXCLUDED.occurrence_count,
                example_messages = ARRAY(
                    SELECT DISTINCT unnest(
                        pending_replace_words.example_messages || EXCLUDED.example_messages
                    ) LIMIT 5
                ),
                confidence_score = GREATEST(pending_replace_words.confidence_score, EXCLUDED.confidence_score),
                status = 'pending';
        """
        pg_hook.run(
            upsert_sql,
            parameters=(
                item['source'],
                item['target'],
                item.get('confidence', 0.8),
                item.get('examples', [])[:5],
                occurrence_count_7d
            )
        )
        saved_count += 1

    # 儲存特殊詞彙
    dictionaries = context['task_instance'].xcom_pull(task_ids='load_existing_dictionaries', key='dictionaries')
    replace_mapping = dictionaries.get('replace_mapping', {})

    # 建立反向對照：target -> list of sources
    target_to_sources = {}
    for src, tgt in replace_mapping.items():
        if tgt not in target_to_sources:
            target_to_sources[tgt] = []
        target_to_sources[tgt].append(src)

    for item in filtered_special:
        word = item['word']
        
        # 找出該詞及其所有來源（同義詞/變體）
        synonyms = [word] + target_to_sources.get(word, [])
        
        # 計算近 7 天的出現次數（在當前直播，包含所有同義詞/變體）
        # 使用 LIKE ANY (ARRAY['%word1%', '%word2%', ...]) 來一次查詢多個關鍵字
        count_sql = """
            SELECT COUNT(*) 
            FROM chat_messages 
            WHERE message LIKE ANY(%s)
            AND published_at > NOW() - INTERVAL '7 days'
            AND live_stream_id = (
                SELECT live_stream_id
                FROM chat_messages
                ORDER BY published_at DESC
                LIMIT 1
            )
        """
        like_patterns = [f"%{s}%" for s in synonyms]
        
        result = pg_hook.get_first(count_sql, parameters=(like_patterns,))
        occurrence_count_7d = result[0] if result else 0
        
        print(f"Special word '{word}' (synonyms: {synonyms}): {occurrence_count_7d} occurrences in last 7 days")

        upsert_sql = """
            INSERT INTO pending_special_words
                (word, word_type, confidence_score, example_messages, occurrence_count)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (word)
            DO UPDATE SET
                occurrence_count = EXCLUDED.occurrence_count,
                example_messages = ARRAY(
                    SELECT DISTINCT unnest(
                        pending_special_words.example_messages || EXCLUDED.example_messages
                    ) LIMIT 5
                ),
                confidence_score = GREATEST(pending_special_words.confidence_score, EXCLUDED.confidence_score),
                status = 'pending';
        """
        pg_hook.run(
            upsert_sql,
            parameters=(
                word,
                item.get('type', 'unknown'),
                item.get('confidence', 0.8),
                item.get('examples', [])[:5],
                occurrence_count_7d
            )
        )
        saved_count += 1

    print(f"Saved {saved_count} discoveries to pending tables")

    return {
        'replace_words_saved': len(filtered_replace),
        'special_words_saved': len(filtered_special),
        'total_saved': saved_count
    }


def update_checkpoint(**context):
    """
    Task 7: 更新分析檢查點
    """
    # 從 analyze_with_gemini 獲取最後一條留言資訊（輕量級）
    last_message_info = context['task_instance'].xcom_pull(task_ids='analyze_with_gemini', key='last_message_info')

    if not last_message_info:
        print("No messages analyzed, checkpoint not updated")
        return

    last_message_id = last_message_info['message_id']
    last_message_time = last_message_info['published_at']

    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    update_sql = """
        UPDATE word_analysis_checkpoint
        SET last_analyzed_message_id = %s,
            last_analyzed_timestamp = %s,
            updated_at = NOW()
        WHERE id = (SELECT MAX(id) FROM word_analysis_checkpoint);
    """

    pg_hook.run(update_sql, parameters=(last_message_id, last_message_time))

    print(f"Checkpoint updated to: {last_message_time}")

    return {
        'last_message_id': last_message_id,
        'last_message_time': last_message_time
    }


def finalize_analysis(**context):
    """
    Task 8: 完成分析，更新執行記錄
    """
    run_id = context['task_instance'].xcom_pull(task_ids='initialize_analysis', key='run_id')
    log_id = context['task_instance'].xcom_pull(task_ids='initialize_analysis', key='log_id')

    # 從 analyze_with_gemini 獲取實際分析的留言數
    messages_analyzed = context['task_instance'].xcom_pull(task_ids='analyze_with_gemini', key='messages_analyzed_count') or 0
    save_result = context['task_instance'].xcom_pull(task_ids='save_discoveries')

    pg_hook = PostgresHook(postgres_conn_id='postgres_hermes')

    # 計算執行時間
    start_time_str = context['task_instance'].xcom_pull(task_ids='initialize_analysis')['start_time']
    start_time = datetime.fromisoformat(start_time_str)
    execution_time = int((datetime.now() - start_time).total_seconds())

    # 更新執行記錄
    update_log_sql = """
        UPDATE word_analysis_log
        SET analysis_end_time = %s,
            messages_analyzed = %s,
            new_replace_words_found = %s,
            new_special_words_found = %s,
            api_calls_made = %s,
            status = 'completed',
            execution_time_seconds = %s
        WHERE id = %s;
    """

    pg_hook.run(
        update_log_sql,
        parameters=(
            datetime.now(),
            messages_analyzed,
            save_result.get('replace_words_saved', 0),
            save_result.get('special_words_saved', 0),
            1,  # API calls
            execution_time,
            log_id
        )
    )

    print("=" * 60)
    print("Analysis Summary:")
    print("=" * 60)
    print(f"Run ID: {run_id}")
    print(f"Messages Analyzed: {messages_analyzed}")
    print(f"New Replace Words Found: {save_result.get('replace_words_saved', 0)}")
    print(f"New Special Words Found: {save_result.get('special_words_saved', 0)}")
    print(f"Execution Time: {execution_time} seconds")
    print("=" * 60)

    return {
        'run_id': run_id,
        'status': 'completed',
        'execution_time': execution_time
    }


# 定義任務
task_create_tables = PythonOperator(
    task_id='create_tables_if_not_exists',
    python_callable=create_tables_if_not_exists,
    dag=dag,
)

task_init = PythonOperator(
    task_id='initialize_analysis',
    python_callable=initialize_analysis,
    dag=dag,
)

task_fetch = PythonOperator(
    task_id='fetch_new_messages',
    python_callable=fetch_new_messages,
    dag=dag,
)

task_load_dict = PythonOperator(
    task_id='load_existing_dictionaries',
    python_callable=load_existing_dictionaries,
    dag=dag,
)

task_analyze = PythonOperator(
    task_id='analyze_with_gemini',
    python_callable=analyze_with_gemini,
    dag=dag,
)

task_filter = PythonOperator(
    task_id='filter_and_validate',
    python_callable=filter_and_validate,
    dag=dag,
)

task_save = PythonOperator(
    task_id='save_discoveries',
    python_callable=save_discoveries,
    dag=dag,
)

task_checkpoint = PythonOperator(
    task_id='update_checkpoint',
    python_callable=update_checkpoint,
    dag=dag,
)

task_finalize = PythonOperator(
    task_id='finalize_analysis',
    python_callable=finalize_analysis,
    dag=dag,
)

# 定義任務依賴
# 1. 先創建表
# 2. 初始化分析
# 3. 並行：獲取新留言 + 載入現有字典
# 4. 使用 Gemini 分析
# 5. 過濾和驗證
# 6. 儲存發現
# 7. 更新檢查點
# 8. 完成分析
task_create_tables >> task_init
task_init >> [task_fetch, task_load_dict]
[task_fetch, task_load_dict] >> task_analyze >> task_filter >> task_save >> task_checkpoint >> task_finalize
