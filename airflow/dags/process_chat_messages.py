"""
Airflow DAG: Process Chat Messages
將聊天留言進行 ETL 處理，包含替換詞彙、emoji 解析、斷詞等

執行頻率：每小時一次
功能：
1. 從 chat_messages 讀取原始留言
2. 套用 replace_words 替換詞彙
3. 提取 Unicode emoji 和 YouTube emotes
4. 使用 jieba 進行斷詞
5. 寫入 processed_chat_messages 表

Airflow Variables:
- PROCESS_CHAT_DAG_START_TIME: 處理的最早時間（ISO 格式）
- PROCESS_CHAT_DAG_RESET: 設為 true 時清空表並從頭開始處理
"""

from datetime import datetime, timedelta, timezone
import json
from typing import Dict, List, Any, Optional

from airflow import DAG
from airflow.models import Variable
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook

from text_processor import process_messages_batch

# 常數配置
BATCH_SIZE = 1000  # 每批處理的留言數量
DB_CONN_ID = 'postgres_hermes'

# 默認參數
default_args = {
    'owner': 'hermes',
    'depends_on_past': False,
    'start_date': datetime(2025, 1, 13),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

# DAG 定義
dag = DAG(
    'process_chat_messages',
    default_args=default_args,
    description='Process chat messages with text analysis (replace words, tokenization, emoji extraction)',
    schedule_interval='0 * * * *',  # 每小時執行
    catchup=False,
    tags=['etl', 'text-analysis', 'chat'],
)


def check_reset(**context):
    """
    Task 1: 檢查是否需要重置
    如果 PROCESS_CHAT_DAG_RESET 為 true，則清空處理表
    """
    reset_flag = Variable.get("PROCESS_CHAT_DAG_RESET", default_var="false")

    if reset_flag.lower() == "true":
        print("Reset flag is TRUE - truncating processed tables")

        pg_hook = PostgresHook(postgres_conn_id=DB_CONN_ID)

        # 清空處理表
        truncate_sql = """
            TRUNCATE TABLE processed_chat_messages;
            TRUNCATE TABLE processed_chat_checkpoint;
        """
        pg_hook.run(truncate_sql)

        # 重設 reset flag 為 false
        Variable.set("PROCESS_CHAT_DAG_RESET", "false")

        print("Tables truncated and reset flag set to false")
        context['task_instance'].xcom_push(key='reset_performed', value=True)
        return {'reset': True}

    print("Reset flag is FALSE - proceeding with incremental processing")
    context['task_instance'].xcom_push(key='reset_performed', value=False)
    return {'reset': False}


def create_tables_if_not_exists(**context):
    """
    Task 2: 創建表（如果不存在）
    """
    pg_hook = PostgresHook(postgres_conn_id=DB_CONN_ID)

    create_tables_sql = """
    -- 處理後的留言表
    CREATE TABLE IF NOT EXISTS processed_chat_messages (
        message_id VARCHAR(255) PRIMARY KEY,
        live_stream_id VARCHAR(255) NOT NULL,
        original_message TEXT NOT NULL,
        processed_message TEXT NOT NULL,
        tokens TEXT[],
        unicode_emojis TEXT[],
        youtube_emotes JSONB,
        author_name VARCHAR(255) NOT NULL,
        author_id VARCHAR(255) NOT NULL,
        published_at TIMESTAMP WITH TIME ZONE NOT NULL,
        processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ETL 檢查點表
    CREATE TABLE IF NOT EXISTS processed_chat_checkpoint (
        id SERIAL PRIMARY KEY,
        last_processed_message_id VARCHAR(255),
        last_processed_timestamp TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- 創建索引
    CREATE INDEX IF NOT EXISTS idx_processed_chat_live_stream ON processed_chat_messages(live_stream_id);
    CREATE INDEX IF NOT EXISTS idx_processed_chat_published_at ON processed_chat_messages(published_at);
    CREATE INDEX IF NOT EXISTS idx_processed_chat_author_id ON processed_chat_messages(author_id);
    CREATE INDEX IF NOT EXISTS idx_processed_chat_tokens ON processed_chat_messages USING GIN(tokens);
    CREATE INDEX IF NOT EXISTS idx_processed_chat_emojis ON processed_chat_messages USING GIN(unicode_emojis);
    """

    pg_hook.run(create_tables_sql)
    print("Tables created or already exist")
    return {'status': 'success'}


def load_dictionaries(**context):
    """
    Task 3: 載入字典資料
    """
    pg_hook = PostgresHook(postgres_conn_id=DB_CONN_ID)

    # 載入替換詞彙
    replace_sql = "SELECT source_word, target_word FROM replace_words;"
    replace_records = pg_hook.get_records(replace_sql)
    replace_dict = {r[0]: r[1] for r in replace_records}

    # 載入特殊詞彙
    special_sql = "SELECT word FROM special_words;"
    special_records = pg_hook.get_records(special_sql)
    special_words = [r[0] for r in special_records]

    print(f"Loaded {len(replace_dict)} replace words")
    print(f"Loaded {len(special_words)} special words")

    context['task_instance'].xcom_push(key='replace_dict', value=replace_dict)
    context['task_instance'].xcom_push(key='special_words', value=special_words)

    return {
        'replace_words_count': len(replace_dict),
        'special_words_count': len(special_words)
    }


def get_checkpoint_timestamp(pg_hook) -> datetime:
    """
    取得檢查點時間戳
    """
    # 先檢查 Variable 設定的起始時間
    start_time_str = Variable.get("PROCESS_CHAT_DAG_START_TIME", default_var=None)
    if start_time_str:
        try:
            var_start_time = datetime.fromisoformat(start_time_str)
            # 如果沒有時區資訊，假設為 UTC
            if var_start_time.tzinfo is None:
                var_start_time = var_start_time.replace(tzinfo=timezone.utc)
        except ValueError:
            var_start_time = None
    else:
        var_start_time = None

    # 從 checkpoint 表讀取
    checkpoint_sql = """
        SELECT last_processed_timestamp
        FROM processed_chat_checkpoint
        ORDER BY updated_at DESC
        LIMIT 1;
    """
    result = pg_hook.get_first(checkpoint_sql)
    db_checkpoint = result[0] if result else None

    # 決定使用哪個時間
    if var_start_time and db_checkpoint:
        # 使用較早的時間
        return min(var_start_time, db_checkpoint)
    elif var_start_time:
        return var_start_time
    elif db_checkpoint:
        return db_checkpoint
    else:
        # 預設從 7 天前開始
        return datetime.now(timezone.utc) - timedelta(days=7)


def fetch_batch(pg_hook, checkpoint_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
    """
    獲取一批待處理的留言
    
    Args:
        checkpoint_time: 起始時間點
        end_time: 結束時間點（DAG 執行當下的時間）
    """
    fetch_sql = """
        SELECT cm.message_id, cm.live_stream_id, cm.message, cm.emotes,
               cm.author_name, cm.author_id, cm.published_at
        FROM chat_messages cm
        LEFT JOIN processed_chat_messages pcm ON cm.message_id = pcm.message_id
        WHERE cm.published_at >= %s
          AND cm.published_at <= %s
          AND pcm.message_id IS NULL
        ORDER BY cm.published_at ASC
        LIMIT %s;
    """

    messages = pg_hook.get_records(fetch_sql, parameters=(checkpoint_time, end_time, BATCH_SIZE))

    messages_data = []
    for msg in messages:
        messages_data.append({
            'message_id': msg[0],
            'live_stream_id': msg[1],
            'message': msg[2],
            'emotes': msg[3],
            'author_name': msg[4],
            'author_id': msg[5],
            'published_at': msg[6].isoformat() if msg[6] else None
        })

    return messages_data


def upsert_batch(pg_hook, processed_messages: List[Dict[str, Any]]) -> int:
    """
    批次寫入處理結果
    """
    upsert_sql = """
        INSERT INTO processed_chat_messages
            (message_id, live_stream_id, original_message, processed_message,
             tokens, unicode_emojis, youtube_emotes, author_name, author_id, published_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (message_id)
        DO UPDATE SET
            processed_message = EXCLUDED.processed_message,
            tokens = EXCLUDED.tokens,
            unicode_emojis = EXCLUDED.unicode_emojis,
            youtube_emotes = EXCLUDED.youtube_emotes,
            processed_at = NOW();
    """

    for msg in processed_messages:
        pg_hook.run(
            upsert_sql,
            parameters=(
                msg['message_id'],
                msg['live_stream_id'],
                msg['original_message'],
                msg['processed_message'],
                msg['tokens'],
                msg['unicode_emojis'],
                json.dumps(msg['youtube_emotes']) if msg['youtube_emotes'] else None,
                msg['author_name'],
                msg['author_id'],
                msg['published_at']
            )
        )

    return len(processed_messages)


def update_checkpoint_record(pg_hook, last_message_id: str, last_published_at: str):
    """
    更新檢查點記錄
    """
    check_sql = "SELECT COUNT(*) FROM processed_chat_checkpoint;"
    result = pg_hook.get_first(check_sql)
    has_checkpoint = result[0] > 0 if result else False

    if has_checkpoint:
        update_sql = """
            UPDATE processed_chat_checkpoint
            SET last_processed_message_id = %s,
                last_processed_timestamp = %s,
                updated_at = NOW()
            WHERE id = (SELECT MAX(id) FROM processed_chat_checkpoint);
        """
        pg_hook.run(update_sql, parameters=(last_message_id, last_published_at))
    else:
        insert_sql = """
            INSERT INTO processed_chat_checkpoint
                (last_processed_message_id, last_processed_timestamp)
            VALUES (%s, %s);
        """
        pg_hook.run(insert_sql, parameters=(last_message_id, last_published_at))


def process_all_batches(**context):
    """
    Task 4: 循環處理所有待處理的留言
    
    以 chunk 方式處理，每次處理 BATCH_SIZE 條，
    處理範圍：從 checkpoint 到 DAG 執行當下的時間
    """
    pg_hook = PostgresHook(postgres_conn_id=DB_CONN_ID)
    replace_dict = context['task_instance'].xcom_pull(task_ids='load_dictionaries', key='replace_dict')
    special_words = context['task_instance'].xcom_pull(task_ids='load_dictionaries', key='special_words')

    # 取得起始檢查點
    checkpoint_time = get_checkpoint_timestamp(pg_hook)
    
    # 固定結束時間點（DAG 執行當下）
    end_time = datetime.now(timezone.utc)
    
    print(f"Processing range: {checkpoint_time} -> {end_time}")

    total_processed = 0
    batch_count = 0

    while True:
        # 獲取一批留言（限制在 checkpoint_time ~ end_time 範圍內）
        messages = fetch_batch(pg_hook, checkpoint_time, end_time)

        if not messages:
            print(f"No more messages to process. Total batches: {batch_count}, Total messages: {total_processed}")
            break

        batch_count += 1
        print(f"Batch {batch_count}: Processing {len(messages)} messages...")

        # 處理留言
        processed_messages = process_messages_batch(
            messages=messages,
            replace_dict=replace_dict,
            special_words=special_words
        )

        # 寫入資料庫
        upserted = upsert_batch(pg_hook, processed_messages)
        total_processed += upserted

        # 更新檢查點（每批都更新，避免失敗時需要重新處理）
        last_message = processed_messages[-1]
        update_checkpoint_record(
            pg_hook,
            last_message['message_id'],
            last_message['published_at']
        )

        print(f"Batch {batch_count} completed: {upserted} messages upserted, checkpoint updated to {last_message['published_at']}")

        # 釋放記憶體
        del messages
        del processed_messages

    print("="*60)
    print(f"Processing Summary:")
    print(f"  - Total batches: {batch_count}")
    print(f"  - Total messages processed: {total_processed}")
    print("="*60)

    return {
        'total_batches': batch_count,
        'total_processed': total_processed
    }


def check_dictionaries_tables(**context):
    """
    檢查字典表是否存在（空表允許繼續執行）
    """
    pg_hook = PostgresHook(postgres_conn_id=DB_CONN_ID)
    
    # 檢查表是否存在
    check_sql = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('replace_words', 'special_words');
    """
    tables = pg_hook.get_records(check_sql)
    existing_tables = {t[0] for t in tables}
    
    # 驗證兩個表都存在
    required_tables = {'replace_words', 'special_words'}
    missing_tables = required_tables - existing_tables
    
    if missing_tables:
        raise ValueError(
            f"Required tables missing: {missing_tables}. "
            "Please run 'import_text_analysis_dicts' DAG first."
        )
    
    # 檢查表是否有資料（僅警告，不阻止執行）
    for table in required_tables:
        count_sql = f"SELECT COUNT(*) FROM {table};"
        result = pg_hook.get_first(count_sql)
        count = result[0] if result else 0
        
        if count == 0:
            print(f"⚠️ WARNING: Table '{table}' exists but is empty. "
                  "Processing will continue but results may be incomplete.")
        else:
            print(f"✅ Table '{table}' has {count} records.")
    
    return {'status': 'ok', 'tables_checked': list(required_tables)}


# 定義任務
task_check_reset = PythonOperator(
    task_id='check_reset',
    python_callable=check_reset,
    dag=dag,
)

task_create_tables = PythonOperator(
    task_id='create_tables_if_not_exists',
    python_callable=create_tables_if_not_exists,
    dag=dag,
)

task_check_tables = PythonOperator(
    task_id='check_dictionaries_tables',
    python_callable=check_dictionaries_tables,
    dag=dag,
)

task_load_dict = PythonOperator(
    task_id='load_dictionaries',
    python_callable=load_dictionaries,
    dag=dag,
)

task_process_all = PythonOperator(
    task_id='process_all_batches',
    python_callable=process_all_batches,
    dag=dag,
)

# 定義任務依賴
# 1. 檢查是否需要重置
# 2. 創建表
# 3. 檢查字典表是否存在
# 4. 載入字典
# 5. 循環處理所有批次
task_check_reset >> task_create_tables >> task_check_tables >> task_load_dict >> task_process_all
