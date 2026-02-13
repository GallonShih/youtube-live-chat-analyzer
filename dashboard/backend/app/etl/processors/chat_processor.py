"""
Chat Processor Module
聊天訊息處理邏輯（遷移自 Airflow process_chat_messages.py）

ORM migration:
- Reset, dictionaries, checkpoint, upsert → ORM
- Batch fetch (LEFT JOIN) → raw SQL (performance critical)
- Table existence check → raw SQL (information_schema)
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional

from sqlalchemy import func

from app.etl.config import ETLConfig
from app.etl.processors.base import BaseETLProcessor
from app.utils.orm_helpers import bulk_upsert
from .text_processor import process_messages_batch

logger = logging.getLogger(__name__)

# 常數配置
DEFAULT_BATCH_SIZE = 1000


class ChatProcessor(BaseETLProcessor):
    """
    聊天訊息處理器

    功能：
    1. 從 chat_messages 讀取原始留言
    2. 套用 replace_words 替換詞彙
    3. 提取 Unicode emoji 和 YouTube emotes
    4. 使用 jieba 進行斷詞
    5. 寫入 processed_chat_messages 表
    """

    def __init__(self):
        super().__init__()

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

            # 2. 檢查字典表是否存在
            self._check_dictionaries_tables()

            # 3. 載入字典
            replace_dict, special_words = self._load_dictionaries()

            # 4. 循環處理所有批次
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

        如果 PROCESS_CHAT_RESET 為 true，則清空處理表（ORM delete）
        """
        from app.models import ProcessedChatMessage, ProcessedChatCheckpoint

        reset_flag = ETLConfig.get('PROCESS_CHAT_RESET', False)

        if reset_flag:
            logger.info("Reset flag is TRUE - truncating processed tables")

            session = self.get_session()
            try:
                session.query(ProcessedChatMessage).delete()
                session.query(ProcessedChatCheckpoint).delete()
                session.commit()
            finally:
                session.close()

            # 重設 reset flag 為 false
            ETLConfig.set('PROCESS_CHAT_RESET', 'false', 'boolean')

            logger.info("Tables truncated and reset flag set to false")
            return True

        logger.info("Reset flag is FALSE - proceeding with incremental processing")
        return False

    def _check_dictionaries_tables(self):
        """
        檢查字典表是否存在（保留 raw SQL for information_schema query）
        空表允許繼續執行
        """
        from app.models import ReplaceWord, SpecialWord

        session = self.get_session()
        try:
            result = self.execute_raw_sql(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name IN ('replace_words', 'special_words')
                """,
                session=session
            )
            tables = {row[0] for row in result}

            required_tables = {'replace_words', 'special_words'}
            missing_tables = required_tables - tables

            if missing_tables:
                raise ValueError(
                    f"Required tables missing: {missing_tables}. "
                    "Please run import_dicts task first."
                )

            # 檢查表是否有資料（ORM count）
            for model, table_name in [(ReplaceWord, 'replace_words'), (SpecialWord, 'special_words')]:
                count = session.query(func.count(model.id)).scalar()

                if count == 0:
                    logger.warning(f"Table '{table_name}' exists but is empty. "
                                  "Processing will continue but results may be incomplete.")
                else:
                    logger.info(f"Table '{table_name}' has {count} records.")
        finally:
            session.close()

    def _load_dictionaries(self) -> tuple:
        """
        載入字典資料（ORM）

        Returns:
            (replace_dict, special_words) tuple
        """
        from app.models import ReplaceWord, SpecialWord

        session = self.get_session()
        try:
            # 載入替換詞彙
            replace_words = session.query(ReplaceWord).all()
            replace_dict = {rw.source_word: rw.target_word for rw in replace_words}

            # 載入特殊詞彙
            special_words_orm = session.query(SpecialWord).all()
            special_words = [sw.word for sw in special_words_orm]
        finally:
            session.close()

        logger.info(f"Loaded {len(replace_dict)} replace words")
        logger.info(f"Loaded {len(special_words)} special words")

        return replace_dict, special_words

    def _get_checkpoint_timestamp(self) -> datetime:
        """
        取得檢查點時間戳（ORM）
        """
        from app.models import ProcessedChatCheckpoint

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

        # 從 checkpoint 表讀取（ORM）
        session = self.get_session()
        try:
            checkpoint = session.query(ProcessedChatCheckpoint).order_by(
                ProcessedChatCheckpoint.updated_at.desc()
            ).first()
            db_checkpoint = checkpoint.last_processed_timestamp if checkpoint else None
        finally:
            session.close()

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
        獲取一批待處理的留言（保留 raw SQL for LEFT JOIN performance）

        Args:
            checkpoint_time: 起始時間點
            end_time: 結束時間點

        Returns:
            留言列表
        """
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

        session = self.get_session()
        try:
            result = self.execute_raw_sql(
                fetch_sql,
                {
                    "checkpoint_time": checkpoint_time,
                    "end_time": end_time,
                    "batch_size": batch_size
                },
                session=session
            )
            rows = result.fetchall()
        finally:
            session.close()

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
        批次寫入處理結果（ORM bulk_upsert）

        Args:
            processed_messages: 處理後的留言列表

        Returns:
            寫入數量
        """
        from app.models import ProcessedChatMessage

        if not processed_messages:
            return 0

        # Prepare data for bulk_upsert
        upsert_data = []
        for msg in processed_messages:
            upsert_data.append({
                'message_id': msg['message_id'],
                'live_stream_id': msg['live_stream_id'],
                'original_message': msg['original_message'],
                'processed_message': msg['processed_message'],
                'tokens': msg['tokens'],
                'unicode_emojis': msg['unicode_emojis'],
                'youtube_emotes': msg['youtube_emotes'],
                'author_name': msg['author_name'],
                'author_id': msg['author_id'],
                'published_at': msg['published_at']
            })

        session = self.get_session()
        try:
            count = bulk_upsert(
                session,
                ProcessedChatMessage,
                upsert_data,
                constraint_columns=['message_id'],
                update_columns=[
                    'processed_message', 'tokens',
                    'unicode_emojis', 'youtube_emotes'
                ]
            )
            session.commit()
        finally:
            session.close()

        logger.debug(f"Upserted {count} processed messages")
        return count

    def _update_checkpoint_record(self, last_message_id: str, last_published_at: str):
        """
        更新檢查點記錄（ORM）

        Args:
            last_message_id: 最後處理的留言 ID
            last_published_at: 最後處理的時間戳
        """
        from app.models import ProcessedChatCheckpoint

        session = self.get_session()
        try:
            # 取得最新的 checkpoint 記錄
            checkpoint = session.query(ProcessedChatCheckpoint).order_by(
                ProcessedChatCheckpoint.id.desc()
            ).first()

            if checkpoint:
                checkpoint.last_processed_message_id = last_message_id
                checkpoint.last_processed_timestamp = last_published_at
                checkpoint.updated_at = func.now()
            else:
                checkpoint = ProcessedChatCheckpoint(
                    last_processed_message_id=last_message_id,
                    last_processed_timestamp=last_published_at,
                )
                session.add(checkpoint)

            session.commit()
        finally:
            session.close()

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
