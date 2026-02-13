"""
ETL Tasks Module
ETL 任務入口函數

Advisory locks remain as psycopg2 (PostgreSQL-specific, requires standalone connection).
ETL log operations migrated to ORM.
"""

import logging
import os
import functools
from datetime import datetime
from typing import Dict, Any, Callable, Optional

import psycopg2
from sqlalchemy import func
from sqlalchemy.engine import make_url

from app.core.database import get_db_manager
from app.etl.config import ETLConfig

logger = logging.getLogger(__name__)


def _create_lock_connection():
    """Create a standalone psycopg2 connection for advisory locks (bypasses pool).

    Advisory locks MUST use standalone connections to prevent pool exhaustion.
    This is intentionally NOT migrated to ORM.
    """
    database_url = os.getenv('DATABASE_URL', '')
    if not database_url:
        return None
    url = make_url(database_url)
    return psycopg2.connect(
        host=url.host,
        port=url.port,
        database=url.database,
        user=url.username,
        password=url.password,
    )

# Job name mapping
JOB_NAMES = {
    'process_chat_messages': '處理聊天訊息',
    'discover_new_words': 'AI 詞彙發現',
    'import_dicts': '匯入字典',
    'monitor_collector': '監控 Collector 狀態',
}

# Advisory lock keys for distributed lock (prevent duplicate execution across workers)
ETL_LOCK_KEYS = {
    'process_chat_messages': 737001,
    'discover_new_words': 737002,
    'import_dicts': 737003,
    'monitor_collector': 737004,
}


def with_advisory_lock(lock_key: int):
    """
    Decorator that uses PostgreSQL advisory locks to prevent duplicate
    execution across multiple Uvicorn workers.

    Uses pg_try_advisory_lock (non-blocking). Only the worker that acquires
    the lock executes the task; others skip silently or mark the log as 'skipped'.

    Falls back to executing the task if the lock mechanism itself fails
    (fail-open to avoid breaking existing behavior).

    NOTE: Advisory locks intentionally use psycopg2 standalone connections,
    NOT the ORM connection pool.
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            etl_log_id = kwargs.get('etl_log_id') or (args[0] if args else None)

            raw_conn = None
            try:
                # Create a standalone connection for advisory lock (bypasses pool).
                # This prevents pool exhaustion when multiple jobs run concurrently.
                raw_conn = _create_lock_connection()
                if raw_conn is None:
                    logger.warning(
                        f"[{func.__name__}] No DATABASE_URL, "
                        "falling back to direct execution"
                    )
                    return func(*args, **kwargs)
                cursor = raw_conn.cursor()
                cursor.execute("SELECT pg_try_advisory_lock(%s)", (lock_key,))
                acquired = cursor.fetchone()[0]
                cursor.close()

                if not acquired:
                    logger.info(
                        f"[{func.__name__}] Advisory lock {lock_key} not acquired, "
                        "skipping (another worker is executing this task)"
                    )
                    if etl_log_id:
                        update_etl_log_status(
                            etl_log_id, 'skipped',
                            error_message='Skipped: another worker is already executing this task'
                        )
                    return {'status': 'skipped', 'reason': 'another worker is executing this task'}

                logger.info(
                    f"[{func.__name__}] Advisory lock {lock_key} acquired, executing task"
                )
                try:
                    return func(*args, **kwargs)
                finally:
                    # Release the advisory lock explicitly
                    try:
                        cursor = raw_conn.cursor()
                        cursor.execute("SELECT pg_advisory_unlock(%s)", (lock_key,))
                        cursor.close()
                        raw_conn.commit()
                    except Exception as unlock_err:
                        logger.warning(
                            f"[{func.__name__}] Failed to release advisory lock: {unlock_err}"
                        )
            except Exception as lock_err:
                logger.warning(
                    f"[{func.__name__}] Advisory lock mechanism failed: {lock_err}, "
                    "falling back to direct execution"
                )
                return func(*args, **kwargs)
            finally:
                if raw_conn is not None:
                    try:
                        raw_conn.close()
                    except Exception:
                        pass

        return wrapper
    return decorator


def create_etl_log(job_id: str, trigger_type: str = 'scheduled') -> Optional[int]:
    """
    創建 ETL 執行記錄 (ORM)

    Args:
        job_id: 任務 ID
        trigger_type: 觸發類型 ('scheduled' or 'manual')

    Returns:
        etl_log_id or None if failed
    """
    try:
        from app.models import ETLExecutionLog

        db_manager = get_db_manager()
        session = db_manager.get_session()
        try:
            job_name = JOB_NAMES.get(job_id, job_id)
            log = ETLExecutionLog(
                job_id=job_id,
                job_name=job_name,
                status='running',
                trigger_type=trigger_type,
                started_at=func.now(),
            )
            session.add(log)
            session.commit()
            session.refresh(log)
            log_id = log.id
        finally:
            session.close()

        logger.info(f"Created ETL log: {job_id} (id={log_id}, trigger={trigger_type})")
        return log_id
    except Exception as e:
        logger.error(f"Failed to create ETL log: {e}")
        return None


def update_etl_log_status(
    etl_log_id: int,
    status: str,
    records_processed: int = 0,
    error_message: Optional[str] = None
) -> bool:
    """
    更新 ETL 執行記錄狀態 (ORM)

    Args:
        etl_log_id: ETL 記錄 ID
        status: 新狀態 ('completed', 'failed', 'skipped')
        records_processed: 處理的記錄數
        error_message: 錯誤訊息（用於 failed/skipped 狀態）

    Returns:
        是否成功
    """
    try:
        from app.models import ETLExecutionLog

        db_manager = get_db_manager()
        session = db_manager.get_session()
        try:
            log = session.query(ETLExecutionLog).filter(
                ETLExecutionLog.id == etl_log_id
            ).first()

            if not log:
                logger.warning(f"ETL log {etl_log_id} not found")
                return False

            log.status = status
            log.completed_at = func.now()

            if status == 'completed':
                log.records_processed = records_processed
            elif status in ('failed', 'skipped'):
                error_msg = str(error_message)[:500] if error_message else (
                    'Skipped: task is already running' if status == 'skipped' else None
                )
                log.error_message = error_msg

            # Calculate duration: use raw SQL for EXTRACT since it depends on started_at
            # which is already in the DB row
            from sqlalchemy import text
            session.execute(
                text("""
                    UPDATE etl_execution_log
                    SET duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
                    WHERE id = :id
                """),
                {"id": etl_log_id}
            )

            session.commit()
        finally:
            session.close()

        logger.info(f"Updated ETL log {etl_log_id}: status={status}")
        return True
    except Exception as e:
        logger.error(f"Failed to update ETL log: {e}")
        return False


@with_advisory_lock(ETL_LOCK_KEYS['process_chat_messages'])
def run_process_chat_messages(etl_log_id: Optional[int] = None) -> Dict[str, Any]:
    """
    執行處理聊天訊息任務

    Args:
        etl_log_id: 已存在的 ETL 記錄 ID（手動觸發時傳入）

    排程時間：每小時執行
    """
    logger.info("=" * 60)
    logger.info("Running task: process_chat_messages")
    logger.info("=" * 60)

    # Create ETL log if not provided
    if etl_log_id is None:
        # Scheduled task: create new log
        etl_log_id = create_etl_log('process_chat_messages', 'scheduled')

    try:
        from app.etl.processors.chat_processor import ChatProcessor

        processor = ChatProcessor()
        result = processor.run()

        if etl_log_id:
            update_etl_log_status(
                etl_log_id,
                'completed',
                records_processed=result.get('total_processed', 0)
            )

        return result
    except Exception as e:
        logger.error(f"process_chat_messages failed: {e}")
        if etl_log_id:
            update_etl_log_status(etl_log_id, 'failed', error_message=str(e))
        return {'status': 'failed', 'error': str(e)}


@with_advisory_lock(ETL_LOCK_KEYS['discover_new_words'])
def run_discover_new_words(etl_log_id: Optional[int] = None) -> Dict[str, Any]:
    """
    執行 AI 詞彙發現任務

    Args:
        etl_log_id: 已存在的 ETL 記錄 ID（手動觸發時傳入）

    排程時間：每 3 小時執行
    """
    logger.info("=" * 60)
    logger.info("Running task: discover_new_words")
    logger.info("=" * 60)

    # Create ETL log if not provided
    if etl_log_id is None:
        # Scheduled task: create new log
        etl_log_id = create_etl_log('discover_new_words', 'scheduled')

    try:
        from app.etl.processors.word_discovery import WordDiscoveryProcessor

        processor = WordDiscoveryProcessor(etl_log_id=etl_log_id)
        result = processor.run()

        if etl_log_id:
            update_etl_log_status(
                etl_log_id,
                result.get('status', 'completed'),
                records_processed=result.get('messages_analyzed', 0),
                error_message=result.get('error')
            )

        return result
    except Exception as e:
        logger.error(f"discover_new_words failed: {e}")
        if etl_log_id:
            update_etl_log_status(etl_log_id, 'failed', error_message=str(e))
        return {'status': 'failed', 'error': str(e)}


@with_advisory_lock(ETL_LOCK_KEYS['import_dicts'])
def run_import_dicts(etl_log_id: Optional[int] = None) -> Dict[str, Any]:
    """
    執行字典匯入任務

    Args:
        etl_log_id: 已存在的 ETL 記錄 ID（手動觸發時傳入）

    手動觸發
    """
    logger.info("=" * 60)
    logger.info("Running task: import_dicts")
    logger.info("=" * 60)

    # Create ETL log if not provided
    if etl_log_id is None:
        # This is a manual-only task
        etl_log_id = create_etl_log('import_dicts', 'manual')

    try:
        from app.etl.processors.dict_importer import DictImporter

        importer = DictImporter()
        result = importer.run()

        if etl_log_id:
            update_etl_log_status(
                etl_log_id,
                result.get('status', 'completed'),
                records_processed=result.get('total_processed', 0),
                error_message=result.get('error')
            )

        return result
    except Exception as e:
        logger.error(f"import_dicts failed: {e}")
        if etl_log_id:
            update_etl_log_status(etl_log_id, 'failed', error_message=str(e))
        return {'status': 'failed', 'error': str(e)}


@with_advisory_lock(ETL_LOCK_KEYS['monitor_collector'])
def run_monitor_collector(etl_log_id: Optional[int] = None) -> Dict[str, Any]:
    """
    執行 Collector 監控任務

    Args:
        etl_log_id: 已存在的 ETL 記錄 ID（手動觸發時傳入）

    排程時間：每 30 分鐘執行
    """
    logger.info("=" * 60)
    logger.info("Running task: monitor_collector")
    logger.info("=" * 60)

    # Create ETL log if not provided
    if etl_log_id is None:
        etl_log_id = create_etl_log('monitor_collector', 'scheduled')

    try:
        from app.etl.processors.collector_monitor import CollectorMonitor

        monitor = CollectorMonitor()
        result = monitor.run()

        if etl_log_id:
            update_etl_log_status(
                etl_log_id,
                'completed',
                records_processed=result.get('streams_checked', 0)
            )

        return result
    except Exception as e:
        logger.error(f"monitor_collector failed: {e}")
        if etl_log_id:
            update_etl_log_status(etl_log_id, 'failed', error_message=str(e))
        return {'status': 'failed', 'error': str(e)}


# Task registry - functions now accept optional etl_log_id
TASK_REGISTRY: Dict[str, Callable[..., Dict[str, Any]]] = {
    'process_chat_messages': run_process_chat_messages,
    'discover_new_words': run_discover_new_words,
    'import_dicts': run_import_dicts,
    'monitor_collector': run_monitor_collector,
}

# Manual tasks list
MANUAL_TASKS = [
    {
        'id': 'import_dicts',
        'name': '匯入字典',
        'description': '將 text_analysis/ 目錄下的字典檔匯入資料庫',
        'type': 'manual'
    }
]
