"""
ETL Tasks Module
ETL 任務入口函數
"""

import logging
from datetime import datetime
from typing import Dict, Any, Callable, Optional

from sqlalchemy import text

from app.etl.config import ETLConfig

logger = logging.getLogger(__name__)

# Job name mapping
JOB_NAMES = {
    'process_chat_messages': '處理聊天訊息',
    'discover_new_words': 'AI 詞彙發現',
    'import_dicts': '匯入字典',
    'monitor_collector': '監控 Collector 狀態',
}


def create_etl_log(job_id: str, trigger_type: str = 'scheduled') -> Optional[int]:
    """
    創建 ETL 執行記錄
    
    Args:
        job_id: 任務 ID
        trigger_type: 觸發類型 ('scheduled' or 'manual')
    
    Returns:
        etl_log_id or None if failed
    """
    engine = ETLConfig.get_engine()
    if not engine:
        logger.warning("Cannot create ETL log: database engine not initialized")
        return None
    
    try:
        job_name = JOB_NAMES.get(job_id, job_id)
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO etl_execution_log
                        (job_id, job_name, status, trigger_type, started_at)
                    VALUES (:job_id, :job_name, 'running', :trigger_type, NOW())
                    RETURNING id;
                """),
                {"job_id": job_id, "job_name": job_name, "trigger_type": trigger_type}
            )
            log_id = result.scalar()
            conn.commit()
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
    更新 ETL 執行記錄狀態
    
    Args:
        etl_log_id: ETL 記錄 ID
        status: 新狀態 ('completed', 'failed')
        records_processed: 處理的記錄數
        error_message: 錯誤訊息（僅用於 failed 狀態）
    
    Returns:
        是否成功
    """
    engine = ETLConfig.get_engine()
    if not engine:
        logger.warning("Cannot update ETL log: database engine not initialized")
        return False
    
    try:
        with engine.connect() as conn:
            if status == 'completed':
                conn.execute(
                    text("""
                        UPDATE etl_execution_log
                        SET status = 'completed',
                            completed_at = NOW(),
                            records_processed = :records,
                            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
                        WHERE id = :id;
                    """),
                    {"id": etl_log_id, "records": records_processed}
                )
            elif status == 'failed':
                error_msg = str(error_message)[:500] if error_message else None
                conn.execute(
                    text("""
                        UPDATE etl_execution_log
                        SET status = 'failed',
                            completed_at = NOW(),
                            error_message = :error,
                            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
                        WHERE id = :id;
                    """),
                    {"id": etl_log_id, "error": error_msg}
                )
            conn.commit()
            logger.info(f"Updated ETL log {etl_log_id}: status={status}")
            return True
    except Exception as e:
        logger.error(f"Failed to update ETL log: {e}")
        return False


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
                'completed', 
                records_processed=result.get('total_processed', 0)
            )

        return result
    except Exception as e:
        logger.error(f"import_dicts failed: {e}")
        if etl_log_id:
            update_etl_log_status(etl_log_id, 'failed', error_message=str(e))
        return {'status': 'failed', 'error': str(e)}


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
