"""
Chat Processor Module
聊天訊息處理邏輯（遷移自 Airflow process_chat_messages.py）
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.etl.config import ETLConfig
from .text_processor import process_messages_batch

logger = logging.getLogger(__name__)

# 常數配置
DEFAULT_BATCH_SIZE = 1000


class ChatProcessor:
    """
    聊天訊息處理器

    功能：
    1. 從 chat_messages 讀取原始留言
    2. 套用 replace_words 替換詞彙
    3. 提取 Unicode emoji 和 YouTube emotes
    4. 使用 jieba 進行斷詞
    5. 寫入 processed_chat_messages 表
    """

    def __init__(self, database_url: Optional[str] = None):
        """
        初始化處理器

        Args:
            database_url: 資料庫連線字串，預設從環境變數讀取
        """
        self.database_url = database_url or ETLConfig.get('DATABASE_URL')
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
        執行處理任務

        Returns:
            執行結果摘要
        """
        logger.info("Starting process_chat_messages...")
        start_time = datetime.now()

        try:
            # 1. 檢查是否需要重置
            reset_performed = self._check_reset()

            # 2. 創建表（如果不存在）
            self._create_tables_if_not_exists()

            # 3. 檢查字典表是否存在
            self._check_dictionaries_tables()

            # 4. 載入字典
            replace_dict, special_words = self._load_dictionaries()

            # 5. 循環處理所有批次
            result = self._process_all_batches(replace_dict, special_words)

            # 計算執行時間
            execution_time = int((datetime.now() - start_time).total_seconds())

            logger.info(f"process_chat_messages completed in {execution_time}s")
            logger.info(f"Total batches: {result['total_batches']}, Total processed: {result['total_processed']}")

            return {
                'status': 'completed',
                'reset_performed': reset_performed,
                'total_batches': result['total_batches'],
                'total_processed': result['total_processed'],
                'execution_time_seconds': execution_time
            }

        except Exception as e:
            logger.error(f"process_chat_messages failed: {e}")
            return {
                'status': 'failed',
                'error': str(e),
                'execution_time_seconds': int((datetime.now() - start_time).total_seconds())
            }

    def _check_reset(self) -> bool:
        """
        檢查是否需要重置

        如果 PROCESS_CHAT_RESET 為 true，則清空處理表
        """
        reset_flag = ETLConfig.get('PROCESS_CHAT_RESET', False)

        if reset_flag:
            logger.info("Reset flag is TRUE - truncating processed tables")

            engine = self.get_engine()
            with engine.connect() as conn:
                conn.execute(text("TRUNCATE TABLE processed_chat_messages;"))
                conn.execute(text("TRUNCATE TABLE processed_chat_checkpoint;"))
                conn.commit()

            # 重設 reset flag 為 false
            ETLConfig.set('PROCESS_CHAT_RESET', 'false', 'boolean')

            logger.info("Tables truncated and reset flag set to false")
            return True

        logger.info("Reset flag is FALSE - proceeding with incremental processing")
        return False

    def _create_tables_if_not_exists(self):
        """創建表（如果不存在）"""
        engine = self.get_engine()

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
        CREATE INDEX IF NOT EXISTS idx_processed_chat_stream_published ON processed_chat_messages(live_stream_id, published_at);
        CREATE INDEX IF NOT EXISTS idx_processed_chat_published_at ON processed_chat_messages(published_at);
        CREATE INDEX IF NOT EXISTS idx_processed_chat_author_id ON processed_chat_messages(author_id);
        CREATE INDEX IF NOT EXISTS idx_processed_chat_tokens ON processed_chat_messages USING GIN(tokens);
        CREATE INDEX IF NOT EXISTS idx_processed_chat_emojis ON processed_chat_messages USING GIN(unicode_emojis);
        """

        with engine.connect() as conn:
            conn.execute(text(create_tables_sql))
            conn.commit()

        logger.info("Tables created or already exist")

    def _check_dictionaries_tables(self):
        """
        檢查字典表是否存在（空表允許繼續執行）
        """
        engine = self.get_engine()

        check_sql = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('replace_words', 'special_words');
        """

        with engine.connect() as conn:
            result = conn.execute(text(check_sql))
            tables = {row[0] for row in result}

        required_tables = {'replace_words', 'special_words'}
        missing_tables = required_tables - tables

        if missing_tables:
            raise ValueError(
                f"Required tables missing: {missing_tables}. "
                "Please run import_dicts task first."
            )

        # 檢查表是否有資料（僅警告，不阻止執行）
        for table in required_tables:
            with engine.connect() as conn:
                result = conn.execute(text(f"SELECT COUNT(*) FROM {table};"))
                count = result.scalar()

            if count == 0:
                logger.warning(f"Table '{table}' exists but is empty. "
                              "Processing will continue but results may be incomplete.")
            else:
                logger.info(f"Table '{table}' has {count} records.")

    def _load_dictionaries(self) -> tuple:
        """
        載入字典資料

        Returns:
            (replace_dict, special_words) tuple
        """
        engine = self.get_engine()

        with engine.connect() as conn:
            # 載入替換詞彙
            result = conn.execute(text("SELECT source_word, target_word FROM replace_words;"))
            replace_dict = {row[0]: row[1] for row in result}

            # 載入特殊詞彙
            result = conn.execute(text("SELECT word FROM special_words;"))
            special_words = [row[0] for row in result]

        logger.info(f"Loaded {len(replace_dict)} replace words")
        logger.info(f"Loaded {len(special_words)} special words")

        return replace_dict, special_words

    def _get_checkpoint_timestamp(self) -> datetime:
        """
        取得檢查點時間戳
        """
        engine = self.get_engine()

        # 先檢查設定的起始時間
        start_time_str = ETLConfig.get('PROCESS_CHAT_START_TIME')
        var_start_time = None

        if start_time_str and isinstance(start_time_str, str) and start_time_str.strip():
            try:
                var_start_time = datetime.fromisoformat(start_time_str.strip())
                if var_start_time.tzinfo is None:
                    var_start_time = var_start_time.replace(tzinfo=timezone.utc)
                logger.info(f"Using configured start time: {var_start_time}")
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid PROCESS_CHAT_START_TIME format: {start_time_str}, error: {e}")

        # 從 checkpoint 表讀取
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT last_processed_timestamp
                FROM processed_chat_checkpoint
                ORDER BY updated_at DESC
                LIMIT 1;
            """))
            row = result.fetchone()
            db_checkpoint = row[0] if row else None

        # 決定使用哪個時間
        if var_start_time and db_checkpoint:
            return min(var_start_time, db_checkpoint)
        elif var_start_time:
            return var_start_time
        elif db_checkpoint:
            return db_checkpoint
        else:
            # 預設從 7 天前開始
            return datetime.now(timezone.utc) - timedelta(days=7)

    def _fetch_batch(self, checkpoint_time: datetime, end_time: datetime) -> List[Dict[str, Any]]:
        """
        獲取一批待處理的留言

        Args:
            checkpoint_time: 起始時間點
            end_time: 結束時間點

        Returns:
            留言列表
        """
        engine = self.get_engine()
        batch_size = ETLConfig.get('PROCESS_CHAT_BATCH_SIZE', DEFAULT_BATCH_SIZE)

        fetch_sql = """
            SELECT cm.message_id, cm.live_stream_id, cm.message, cm.emotes,
                   cm.author_name, cm.author_id, cm.published_at
            FROM chat_messages cm
            LEFT JOIN processed_chat_messages pcm ON cm.message_id = pcm.message_id
            WHERE cm.published_at >= :checkpoint_time
              AND cm.published_at <= :end_time
              AND pcm.message_id IS NULL
            ORDER BY cm.published_at ASC
            LIMIT :batch_size;
        """

        with engine.connect() as conn:
            result = conn.execute(
                text(fetch_sql),
                {
                    "checkpoint_time": checkpoint_time,
                    "end_time": end_time,
                    "batch_size": batch_size
                }
            )
            rows = result.fetchall()

        messages_data = []
        for row in rows:
            messages_data.append({
                'message_id': row[0],
                'live_stream_id': row[1],
                'message': row[2],
                'emotes': row[3],
                'author_name': row[4],
                'author_id': row[5],
                'published_at': row[6].isoformat() if row[6] else None
            })

        return messages_data

    def _upsert_batch(self, processed_messages: List[Dict[str, Any]]) -> int:
        """
        批次寫入處理結果

        Args:
            processed_messages: 處理後的留言列表

        Returns:
            寫入數量
        """
        engine = self.get_engine()

        upsert_sql = """
            INSERT INTO processed_chat_messages
                (message_id, live_stream_id, original_message, processed_message,
                 tokens, unicode_emojis, youtube_emotes, author_name, author_id, published_at)
            VALUES (:message_id, :live_stream_id, :original_message, :processed_message,
                    :tokens, :unicode_emojis, :youtube_emotes, :author_name, :author_id, :published_at)
            ON CONFLICT (message_id)
            DO UPDATE SET
                processed_message = EXCLUDED.processed_message,
                tokens = EXCLUDED.tokens,
                unicode_emojis = EXCLUDED.unicode_emojis,
                youtube_emotes = EXCLUDED.youtube_emotes,
                processed_at = NOW();
        """

        with engine.connect() as conn:
            for msg in processed_messages:
                conn.execute(
                    text(upsert_sql),
                    {
                        'message_id': msg['message_id'],
                        'live_stream_id': msg['live_stream_id'],
                        'original_message': msg['original_message'],
                        'processed_message': msg['processed_message'],
                        'tokens': msg['tokens'],
                        'unicode_emojis': msg['unicode_emojis'],
                        'youtube_emotes': json.dumps(msg['youtube_emotes']) if msg['youtube_emotes'] else None,
                        'author_name': msg['author_name'],
                        'author_id': msg['author_id'],
                        'published_at': msg['published_at']
                    }
                )
            conn.commit()

        return len(processed_messages)

    def _update_checkpoint_record(self, last_message_id: str, last_published_at: str):
        """
        更新檢查點記錄

        Args:
            last_message_id: 最後處理的留言 ID
            last_published_at: 最後處理的時間戳
        """
        engine = self.get_engine()

        with engine.connect() as conn:
            # 檢查是否有 checkpoint 記錄
            result = conn.execute(text("SELECT COUNT(*) FROM processed_chat_checkpoint;"))
            has_checkpoint = result.scalar() > 0

            if has_checkpoint:
                conn.execute(
                    text("""
                        UPDATE processed_chat_checkpoint
                        SET last_processed_message_id = :message_id,
                            last_processed_timestamp = :timestamp,
                            updated_at = NOW()
                        WHERE id = (SELECT MAX(id) FROM processed_chat_checkpoint);
                    """),
                    {"message_id": last_message_id, "timestamp": last_published_at}
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO processed_chat_checkpoint
                            (last_processed_message_id, last_processed_timestamp)
                        VALUES (:message_id, :timestamp);
                    """),
                    {"message_id": last_message_id, "timestamp": last_published_at}
                )
            conn.commit()

    def _process_all_batches(
        self,
        replace_dict: Dict[str, str],
        special_words: List[str]
    ) -> Dict[str, Any]:
        """
        循環處理所有待處理的留言

        Args:
            replace_dict: 替換詞彙字典
            special_words: 特殊詞彙列表

        Returns:
            處理結果摘要
        """
        # 取得起始檢查點
        checkpoint_time = self._get_checkpoint_timestamp()

        # 固定結束時間點（執行當下）
        end_time = datetime.now(timezone.utc)

        logger.info(f"Processing range: {checkpoint_time} -> {end_time}")

        total_processed = 0
        batch_count = 0

        while True:
            # 獲取一批留言
            messages = self._fetch_batch(checkpoint_time, end_time)

            if not messages:
                logger.info(f"No more messages to process. Total batches: {batch_count}, Total messages: {total_processed}")
                break

            batch_count += 1
            logger.info(f"Batch {batch_count}: Processing {len(messages)} messages...")

            # 處理留言
            processed_messages = process_messages_batch(
                messages=messages,
                replace_dict=replace_dict,
                special_words=special_words
            )

            # 寫入資料庫
            upserted = self._upsert_batch(processed_messages)
            total_processed += upserted

            # 更新檢查點
            last_message = processed_messages[-1]
            self._update_checkpoint_record(
                last_message['message_id'],
                last_message['published_at']
            )

            logger.info(f"Batch {batch_count} completed: {upserted} messages upserted")

            # 釋放記憶體
            del messages
            del processed_messages

        return {
            'total_batches': batch_count,
            'total_processed': total_processed
        }
