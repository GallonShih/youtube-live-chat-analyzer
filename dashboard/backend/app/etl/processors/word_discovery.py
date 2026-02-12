"""
Word Discovery Processor Module
AI 詞彙發現邏輯（遷移自 Airflow discover_new_words.py）
"""

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Set, Tuple

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.etl.config import ETLConfig

logger = logging.getLogger(__name__)

# 常數配置
DEFAULT_BATCH_SIZE = 500
DEFAULT_MIN_CONFIDENCE = 0.7


def filter_and_validate_words(
    gemini_replace_words: List[Dict],
    gemini_special_words: List[Dict],
    existing_replace_mapping: Dict[str, str],
    existing_special_words: Set[str]
) -> Tuple[List[Dict], List[Dict]]:
    """
    過濾和驗證 Gemini 發現的詞彙

    規則：
    1. Protected Words 自動顛倒：如果 source 在 protected_words 中，顛倒 source 和 target
    2. Source 已存在自動轉換：DB: A->B, Gemini: A->C => C->B
    3. 跳過重複的 source：轉換後的 source 如果已存在，跳過
    4. Target 自動加入 special words：替換詞彙的 target 自動加入特殊詞彙（如果不在 DB）
    5. 跳過已存在的 special words
    """
    # 計算衍生集合
    replace_sources_set = set(existing_replace_mapping.keys())
    replace_targets_set = set(existing_replace_mapping.values())
    protected_words_set = replace_targets_set | existing_special_words

    # 過濾替換詞彙
    filtered_replace = []
    auto_add_special = []

    for item in gemini_replace_words:
        source = item.get('source', '')
        target = item.get('target', '')

        # 基礎規則: 如果 source 和 target 相同，則跳過
        if source == target:
            continue

        original_source = source
        original_target = target

        # 規則 1: Protected Words 自動顛倒
        if source in protected_words_set:
            source, target = target, source
            item['source'] = source
            item['target'] = target
            item['_transformation'] = f'swapped (protected): {original_source} <-> {original_target}'

            # Swap 後檢查是否完全重複
            if source in replace_sources_set and existing_replace_mapping[source] == target:
                continue

        # 規則 2: Source 已存在自動轉換
        if source in replace_sources_set:
            db_target = existing_replace_mapping[source]
            new_source = target
            new_target = db_target

            item['source'] = new_source
            item['target'] = new_target
            item['_transformation'] = f'transformed: {original_source}->{original_target} => {new_source}->{new_target}'

            source = new_source
            target = new_target

            # 規則 3: 檢查轉換後的 source 是否已經存在
            if source in replace_sources_set:
                continue

        # 通過所有檢查，加入過濾後的列表
        filtered_replace.append(item)

        # 規則 4: Target 自動加入 special words
        if target not in existing_special_words:
            auto_add_special.append({
                'word': target,
                'type': 'auto_from_replace',
                'confidence': 1.0,
                'examples': [f'替換詞彙的目標：{source} -> {target}'],
                'reason': f'自動從替換詞彙的目標詞彙加入',
                '_auto_added': True
            })
            existing_special_words.add(target)

    # 過濾特殊詞彙
    filtered_special = []

    for item in gemini_special_words:
        word = item.get('word', '')

        # 規則 5: 跳過已存在的 special words
        if word in existing_special_words:
            continue

        filtered_special.append(item)

    # 合併自動加入的 special words
    all_special = filtered_special + auto_add_special

    return filtered_replace, all_special


class WordDiscoveryProcessor:
    """
    AI 詞彙發現處理器

    功能：
    1. 從 chat_messages 讀取新留言
    2. 使用 Gemini API 分析留言
    3. 過濾和驗證發現的詞彙
    4. 儲存到待審核表
    """

    def __init__(self, database_url: Optional[str] = None, etl_log_id: Optional[int] = None):
        """
        初始化處理器

        Args:
            database_url: 資料庫連線字串
            etl_log_id: ETL 執行記錄 ID（用於關聯 etl_execution_log）
        """
        self.database_url = database_url or ETLConfig.get('DATABASE_URL')
        self.etl_log_id = etl_log_id
        self._engine: Optional[Engine] = None

    def get_engine(self) -> Engine:
        """取得資料庫連線引擎"""
        if self._engine is None:
            self._engine = create_engine(
                self.database_url,
                pool_size=1,
                max_overflow=1,
                pool_pre_ping=True,
                pool_recycle=1800,
                pool_reset_on_return="rollback",
            )
        return self._engine

    def run(self) -> Dict[str, Any]:
        """
        執行詞彙發現任務

        Returns:
            執行結果摘要
        """
        # 檢查是否啟用
        if not ETLConfig.get('DISCOVER_NEW_WORDS_ENABLED', True):
            logger.info("Word discovery is disabled")
            return {'status': 'skipped', 'reason': 'disabled'}

        run_id = f"word_discovery_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        logger.info(f"Starting discover_new_words (run_id: {run_id})...")
        start_time = datetime.now()

        try:
            # 1. 創建表（如果不存在）
            self._create_tables_if_not_exists()

            # 2. 初始化分析記錄
            log_id = self._initialize_analysis(run_id)

            # 3. 獲取新留言資訊
            checkpoint_time, message_count = self._fetch_new_messages_info()

            if message_count == 0:
                logger.info("No new messages to analyze")
                self._finalize_analysis(log_id, run_id, start_time, 0, 0, 0)
                return {
                    'status': 'completed',
                    'run_id': run_id,
                    'messages_analyzed': 0
                }

            # 4. 載入現有字典
            dictionaries = self._load_existing_dictionaries()

            # 5. 使用 Gemini API 分析
            analysis_result, messages_analyzed, last_message_info = self._analyze_with_gemini(
                checkpoint_time, dictionaries
            )

            # 6. 過濾和驗證
            filtered_replace, filtered_special = self._filter_and_validate(
                analysis_result, dictionaries
            )

            # 7. 儲存發現
            saved_replace, saved_special = self._save_discoveries(
                filtered_replace, filtered_special, dictionaries
            )

            # 8. 更新檢查點
            if last_message_info:
                self._update_checkpoint(last_message_info)

            # 9. 完成分析
            self._finalize_analysis(
                log_id, run_id, start_time,
                messages_analyzed, saved_replace, saved_special
            )

            execution_time = int((datetime.now() - start_time).total_seconds())

            logger.info(f"discover_new_words completed in {execution_time}s")

            return {
                'status': 'completed',
                'run_id': run_id,
                'messages_analyzed': messages_analyzed,
                'replace_words_found': saved_replace,
                'special_words_found': saved_special,
                'execution_time_seconds': execution_time
            }

        except Exception as e:
            logger.error(f"discover_new_words failed: {e}", exc_info=True)
            
            # Update word_analysis_log status to 'failed'
            try:
                engine = self.get_engine()
                with engine.connect() as conn:
                    conn.execute(
                        text("""
                            UPDATE word_analysis_log
                            SET status = 'failed',
                                error_message = :error,
                                analysis_end_time = :end_time,
                                execution_time_seconds = :exec_time
                            WHERE run_id = :run_id;
                        """),
                        {
                            "error": str(e)[:500],
                            "end_time": datetime.now(),
                            "exec_time": int((datetime.now() - start_time).total_seconds()),
                            "run_id": run_id
                        }
                    )
                    conn.commit()
            except Exception as update_error:
                logger.error(f"Failed to update error status: {update_error}")
            
            return {
                'status': 'failed',
                'run_id': run_id,
                'error': str(e),
                'execution_time_seconds': int((datetime.now() - start_time).total_seconds())
            }

    def _create_tables_if_not_exists(self):
        """創建詞彙發現相關的資料表"""
        engine = self.get_engine()

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
            etl_log_id INTEGER REFERENCES etl_execution_log(id),
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

        with engine.connect() as conn:
            conn.execute(text(create_tables_sql))

            # 初始化 checkpoint
            conn.execute(text("""
                INSERT INTO word_analysis_checkpoint (last_analyzed_timestamp)
                SELECT NOW() - INTERVAL '3 hours'
                WHERE NOT EXISTS (SELECT 1 FROM word_analysis_checkpoint);
            """))
            conn.commit()

        logger.info("Word discovery tables created or already exist")

    def _initialize_analysis(self, run_id: str) -> int:
        """初始化分析任務，創建 word_analysis_log 記錄並關聯 etl_log_id"""
        engine = self.get_engine()

        with engine.connect() as conn:
            # 創建 word_analysis_log 記錄，包含 etl_log_id 外鍵
            result = conn.execute(
                text("""
                    INSERT INTO word_analysis_log (run_id, etl_log_id, analysis_start_time, status)
                    VALUES (:run_id, :etl_log_id, :start_time, 'running')
                    RETURNING id;
                """),
                {
                    "run_id": run_id, 
                    "etl_log_id": self.etl_log_id,
                    "start_time": datetime.now()
                }
            )
            log_id = result.scalar()
            conn.commit()
            
            logger.info(f"Created analysis record: {run_id} (log_id={log_id}, etl_log_id={self.etl_log_id})")

        return log_id

    def _fetch_new_messages_info(self) -> Tuple[datetime, int]:
        """獲取新留言資訊"""
        engine = self.get_engine()

        with engine.connect() as conn:
            # 獲取上次分析的時間點
            result = conn.execute(text("""
                SELECT last_analyzed_timestamp
                FROM word_analysis_checkpoint
                ORDER BY updated_at DESC
                LIMIT 1;
            """))
            row = result.fetchone()
            last_analyzed_time = row[0] if row else datetime.now(timezone.utc) - timedelta(hours=3)

            # 計算待處理留言數量
            result = conn.execute(
                text("""
                    SELECT COUNT(*)
                    FROM chat_messages
                    WHERE published_at > :checkpoint_time
                    AND live_stream_id = (
                        SELECT live_stream_id
                        FROM chat_messages
                        ORDER BY published_at DESC
                        LIMIT 1
                    );
                """),
                {"checkpoint_time": last_analyzed_time}
            )
            message_count = result.scalar() or 0

        logger.info(f"Checkpoint time: {last_analyzed_time}, New messages: {message_count}")
        return last_analyzed_time, message_count

    def _load_existing_dictionaries(self) -> Dict[str, Any]:
        """載入現有字典"""
        engine = self.get_engine()

        with engine.connect() as conn:
            # 載入替換詞彙
            result = conn.execute(text("SELECT source_word, target_word FROM replace_words;"))
            replace_records = result.fetchall()

            # 載入特殊詞彙
            result = conn.execute(text("SELECT word FROM special_words;"))
            special_records = result.fetchall()

        replace_mapping = {r[0]: r[1] for r in replace_records}
        existing_special_words = {r[0] for r in special_records}

        logger.info(f"Loaded dictionaries: {len(replace_mapping)} replace, {len(existing_special_words)} special")

        return {
            'replace_mapping': replace_mapping,
            'replace_sources': set(replace_mapping.keys()),
            'replace_targets': set(replace_mapping.values()),
            'special_words': existing_special_words,
            'protected_words': set(replace_mapping.values()) | existing_special_words
        }

    def _analyze_with_gemini(
        self,
        checkpoint_time: datetime,
        dictionaries: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], int, Optional[Dict[str, Any]]]:
        """使用 Gemini API 分析留言"""
        # 取得 API Key
        api_key = ETLConfig.get('GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY')

        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in settings or environment")

        # 延遲匯入
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash-lite')

        # 獲取留言
        engine = self.get_engine()
        batch_size = ETLConfig.get('DISCOVER_NEW_WORDS_BATCH_SIZE', DEFAULT_BATCH_SIZE)

        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT message_id, message, author_name, published_at
                    FROM chat_messages
                    WHERE published_at > :checkpoint_time
                    AND live_stream_id = (
                        SELECT live_stream_id
                        FROM chat_messages
                        ORDER BY published_at DESC
                        LIMIT 1
                    )
                    ORDER BY published_at ASC
                    LIMIT :batch_size;
                """),
                {"checkpoint_time": checkpoint_time, "batch_size": batch_size * 4}
            )
            messages = result.fetchall()

        if not messages:
            return {'replace_words': [], 'special_words': []}, 0, None

        messages_data = [
            {
                'message_id': m[0],
                'message': m[1],
                'author_name': m[2],
                'published_at': m[3].isoformat() if m[3] else None
            }
            for m in messages
        ]

        logger.info(f"Fetched {len(messages_data)} messages for analysis")

        # 準備提示詞
        messages_text = "\n".join([f"{i+1}. {msg['message']}" for i, msg in enumerate(messages_data[:batch_size])])
        existing_replace_examples = list(dictionaries['replace_sources'])[:20]
        existing_special_examples = list(dictionaries['special_words'])[:30]

        # 預設提示詞範本（作為 fallback）
        # 使用 {{variable}} 格式避免與 JSON 的 {} 衝突
        DEFAULT_PROMPT_TEMPLATE = """
你是一個專門分析網路直播留言的助手。請分析以下留言，找出：

1. **錯別字和變體詞彙**：需要替換成標準詞彙的錯字或諧音
2. **特殊詞彙**：新出現的梗、角色名、網路用語等需要保留的詞彙

**現有的字典（請避免重複建議這些詞）**：
- 已存在的替換詞彙範例：{{replace_examples}}...（共 {{replace_count}} 個）
- 已存在的特殊詞彙範例：{{special_examples}}...（共 {{special_count}} 個）

**重要規則**：
1. 不要建議已存在的詞彙
2. 替換後的標準詞彙（target）必須是準確、完整的詞
3. 特殊詞彙只建議新發現的梗或重要詞彙

**待分析的留言**：
{{messages_text}}

請以 JSON 格式回應，格式如下：
{
  "replace_words": [
    {
      "source": "錯字或變體",
      "target": "標準詞彙",
      "confidence": 0.95,
      "examples": ["範例留言1", "範例留言2"],
      "reason": "簡短說明"
    }
  ],
  "special_words": [
    {
      "word": "特殊詞彙",
      "type": "meme|typo|variant|character|slang",
      "confidence": 0.90,
      "examples": ["範例留言1"],
      "reason": "簡短說明"
    }
  ]
}

注意事項：
1. 只回報**新發現**的詞彙，避免重複現有字典
2. confidence 分數範圍 0.0-1.0，只回報 >= 0.7 的詞彙
3. 每個詞彙提供 1-3 個範例留言
4. 確保 target（替換後的詞）是正確且完整的標準詞彙
"""

        # 從資料庫讀取啟用的提示詞範本
        prompt_template = None
        try:
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT template FROM prompt_templates
                    WHERE is_active = true
                    LIMIT 1
                """))
                row = result.fetchone()
                if row:
                    prompt_template = row[0]
                    logger.info("Loaded active prompt template from database")
                else:
                    logger.warning("No active prompt template found, using default")
        except Exception as e:
            logger.error(f"Error loading prompt template: {e}, using default")
        
        # 如果沒有範本或讀取失敗，使用預設範本
        if not prompt_template:
            prompt_template = DEFAULT_PROMPT_TEMPLATE

        # 使用 str.replace() 填充模板變數（避免與 JSON {} 衝突）
        try:
            prompt = prompt_template
            prompt = prompt.replace('{{replace_examples}}', ', '.join(existing_replace_examples[:10]))
            prompt = prompt.replace('{{replace_count}}', str(len(dictionaries['replace_sources'])))
            prompt = prompt.replace('{{special_examples}}', ', '.join(existing_special_examples[:15]))
            prompt = prompt.replace('{{special_count}}', str(len(dictionaries['special_words'])))
            prompt = prompt.replace('{{messages_text}}', messages_text)
        except Exception as e:
            logger.error(f"Error replacing template variables: {e}")
            # Fallback to default
            prompt = DEFAULT_PROMPT_TEMPLATE
            prompt = prompt.replace('{{replace_examples}}', ', '.join(existing_replace_examples[:10]))
            prompt = prompt.replace('{{replace_count}}', str(len(dictionaries['replace_sources'])))
            prompt = prompt.replace('{{special_examples}}', ', '.join(existing_special_examples[:15]))
            prompt = prompt.replace('{{special_count}}', str(len(dictionaries['special_words'])))
            prompt = prompt.replace('{{messages_text}}', messages_text)


        try:
            # Add timeout to prevent infinite waiting
            logger.info("Calling Gemini API for word discovery...")
            
            # Configure retry strategy: total timeout includes retries
            from google.api_core import retry
            retry_policy = retry.Retry(
                initial=1.0, 
                maximum=10.0, 
                multiplier=2.0, 
                timeout=60.0  # Total deadline for all retries
            )
            
            response = model.generate_content(
                prompt,
                request_options={
                    'timeout': 60,  # Per-request timeout
                    'retry': retry_policy
                }
            )
            response_text = response.text
            logger.info("Gemini API call completed successfully")

            # 清理 JSON
            if response_text.startswith('```json'):
                response_text = response_text[7:]
            if response_text.endswith('```'):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            analysis_result = json.loads(response_text)

            logger.info(f"API Response: {len(analysis_result.get('replace_words', []))} replace, "
                       f"{len(analysis_result.get('special_words', []))} special")

            last_message_info = {
                'message_id': messages_data[-1]['message_id'],
                'published_at': messages_data[-1]['published_at']
            }

            return analysis_result, len(messages_data), last_message_info

        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    def _filter_and_validate(
        self,
        analysis_result: Dict[str, Any],
        dictionaries: Dict[str, Any]
    ) -> Tuple[List[Dict], List[Dict]]:
        """過濾和驗證發現的詞彙"""
        min_confidence = ETLConfig.get('DISCOVER_NEW_WORDS_MIN_CONFIDENCE', DEFAULT_MIN_CONFIDENCE)

        # 過濾低信心的詞彙
        replace_words = [
            w for w in analysis_result.get('replace_words', [])
            if w.get('confidence', 0) >= min_confidence
        ]
        special_words = [
            w for w in analysis_result.get('special_words', [])
            if w.get('confidence', 0) >= min_confidence
        ]

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace_words=replace_words,
            gemini_special_words=special_words,
            existing_replace_mapping=dictionaries['replace_mapping'],
            existing_special_words=dictionaries['special_words'].copy()
        )

        logger.info(f"Filtered: {len(filtered_replace)} replace, {len(filtered_special)} special")

        return filtered_replace, filtered_special

    def _save_discoveries(
        self,
        filtered_replace: List[Dict],
        filtered_special: List[Dict],
        dictionaries: Dict[str, Any]
    ) -> Tuple[int, int]:
        """儲存發現的詞彙"""
        engine = self.get_engine()
        saved_replace = 0
        saved_special = 0

        with engine.connect() as conn:
            # 儲存替換詞彙
            for item in filtered_replace:
                source = item['source']
                target = item['target']

                # 計算近 7 天出現次數
                result = conn.execute(
                    text("""
                        SELECT COUNT(*)
                        FROM chat_messages
                        WHERE message LIKE :pattern
                        AND published_at > NOW() - INTERVAL '7 days'
                    """),
                    {"pattern": f"%{source}%"}
                )
                occurrence_count = result.scalar() or 0

                conn.execute(
                    text("""
                        INSERT INTO pending_replace_words
                            (source_word, target_word, confidence_score, example_messages, occurrence_count)
                        VALUES (:source, :target, :confidence, :examples, :count)
                        ON CONFLICT (source_word, target_word)
                        DO UPDATE SET
                            occurrence_count = EXCLUDED.occurrence_count,
                            confidence_score = GREATEST(pending_replace_words.confidence_score, EXCLUDED.confidence_score),
                            status = 'pending';
                    """),
                    {
                        "source": source,
                        "target": target,
                        "confidence": item.get('confidence', 0.8),
                        "examples": item.get('examples', [])[:5],
                        "count": occurrence_count
                    }
                )
                saved_replace += 1

            # 儲存特殊詞彙
            target_to_sources = {}
            for src, tgt in dictionaries['replace_mapping'].items():
                if tgt not in target_to_sources:
                    target_to_sources[tgt] = []
                target_to_sources[tgt].append(src)

            for item in filtered_special:
                word = item['word']
                synonyms = [word] + target_to_sources.get(word, [])

                result = conn.execute(
                    text("""
                        SELECT COUNT(*)
                        FROM chat_messages
                        WHERE message LIKE ANY(:patterns)
                        AND published_at > NOW() - INTERVAL '7 days'
                    """),
                    {"patterns": [f"%{s}%" for s in synonyms]}
                )
                occurrence_count = result.scalar() or 0

                conn.execute(
                    text("""
                        INSERT INTO pending_special_words
                            (word, word_type, confidence_score, example_messages, occurrence_count)
                        VALUES (:word, :word_type, :confidence, :examples, :count)
                        ON CONFLICT (word)
                        DO UPDATE SET
                            occurrence_count = EXCLUDED.occurrence_count,
                            confidence_score = GREATEST(pending_special_words.confidence_score, EXCLUDED.confidence_score),
                            status = 'pending';
                    """),
                    {
                        "word": word,
                        "word_type": item.get('type', 'unknown'),
                        "confidence": item.get('confidence', 0.8),
                        "examples": item.get('examples', [])[:5],
                        "count": occurrence_count
                    }
                )
                saved_special += 1

            conn.commit()

        logger.info(f"Saved {saved_replace} replace words, {saved_special} special words")
        return saved_replace, saved_special

    def _update_checkpoint(self, last_message_info: Dict[str, Any]):
        """更新分析檢查點"""
        engine = self.get_engine()

        with engine.connect() as conn:
            conn.execute(
                text("""
                    UPDATE word_analysis_checkpoint
                    SET last_analyzed_message_id = :message_id,
                        last_analyzed_timestamp = :timestamp,
                        updated_at = NOW()
                    WHERE id = (SELECT MAX(id) FROM word_analysis_checkpoint);
                """),
                {
                    "message_id": last_message_info['message_id'],
                    "timestamp": last_message_info['published_at']
                }
            )
            conn.commit()

        logger.info(f"Checkpoint updated to: {last_message_info['published_at']}")

    def _finalize_analysis(
        self,
        log_id: int,
        run_id: str,
        start_time: datetime,
        messages_analyzed: int,
        replace_words_found: int,
        special_words_found: int
    ):
        """完成分析記錄"""
        engine = self.get_engine()
        execution_time = int((datetime.now() - start_time).total_seconds())

        with engine.connect() as conn:
            conn.execute(
                text("""
                    UPDATE word_analysis_log
                    SET analysis_end_time = :end_time,
                        messages_analyzed = :messages,
                        new_replace_words_found = :replace,
                        new_special_words_found = :special,
                        api_calls_made = 1,
                        status = 'completed',
                        execution_time_seconds = :exec_time
                    WHERE id = :log_id;
                """),
                {
                    "end_time": datetime.now(),
                    "messages": messages_analyzed,
                    "replace": replace_words_found,
                    "special": special_words_found,
                    "exec_time": execution_time,
                    "log_id": log_id
                }
            )
            conn.commit()

        logger.info(f"Analysis finalized: {run_id}")
