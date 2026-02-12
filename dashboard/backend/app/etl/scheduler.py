"""
ETL Scheduler Module
APScheduler 排程管理模組
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.job import Job

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None


def init_scheduler(database_url: str) -> BackgroundScheduler:
    """
    初始化 APScheduler

    Args:
        database_url: 資料庫連線字串

    Returns:
        BackgroundScheduler 實例
    """
    global _scheduler

    if _scheduler is not None:
        logger.warning("Scheduler already initialized")
        return _scheduler

    # 設定 jobstore（使用 PostgreSQL 持久化）
    from sqlalchemy import create_engine
    jobstore_engine = create_engine(
        database_url,
        pool_size=1,
        max_overflow=1,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_reset_on_return="rollback",
    )
    jobstores = {
        'default': SQLAlchemyJobStore(engine=jobstore_engine)
    }

    # 設定執行緒池
    executors = {
        'default': ThreadPoolExecutor(max_workers=3)
    }

    # 預設任務設定
    job_defaults = {
        'coalesce': True,  # 合併錯過的執行
        'max_instances': 1,  # 同一任務最多一個實例
        'misfire_grace_time': 60 * 30  # 30 分鐘的 misfire 寬限時間
    }

    _scheduler = BackgroundScheduler(
        jobstores=jobstores,
        executors=executors,
        job_defaults=job_defaults,
        timezone='Asia/Taipei'
    )

    logger.info("ETL Scheduler initialized")
    return _scheduler


def register_jobs():
    """
    註冊所有排程任務
    """
    global _scheduler

    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized. Call init_scheduler first.")

    # 延遲匯入避免循環依賴
    from app.etl.tasks import (
        run_process_chat_messages,
        run_discover_new_words,
        run_monitor_collector,
    )

    # 註冊處理聊天訊息任務（每小時執行）
    _scheduler.add_job(
        run_process_chat_messages,
        'cron',
        minute=5,  # 每小時的第 5 分鐘
        id='process_chat_messages',
        name='處理聊天訊息',
        replace_existing=True
    )
    logger.info("Registered job: process_chat_messages (hourly at :05)")

    # 註冊 AI 詞彙發現任務（每 3 小時執行）
    _scheduler.add_job(
        run_discover_new_words,
        'cron',
        hour='*/3',
        minute=15,  # 每 3 小時的第 15 分鐘
        id='discover_new_words',
        name='AI 詞彙發現',
        replace_existing=True
    )
    logger.info("Registered job: discover_new_words (every 3 hours at :15)")

    # 註冊 Collector 監控任務
    import os
    monitor_interval = int(os.getenv('MONITOR_CHECK_INTERVAL_MINUTES', '10'))
    _scheduler.add_job(
        run_monitor_collector,
        'interval',
        minutes=monitor_interval,
        id='monitor_collector',
        name='監控 Collector 狀態',
        replace_existing=True
    )
    logger.info(f"Registered job: monitor_collector (every {monitor_interval} minutes)")


def start_scheduler():
    """
    啟動排程器
    """
    global _scheduler

    if _scheduler is None:
        raise RuntimeError("Scheduler not initialized. Call init_scheduler first.")

    if not _scheduler.running:
        _scheduler.start()
        logger.info("ETL Scheduler started")
    else:
        logger.warning("Scheduler is already running")


def get_scheduler() -> Optional[BackgroundScheduler]:
    """
    取得排程器實例

    Returns:
        BackgroundScheduler 實例或 None
    """
    return _scheduler


def shutdown_scheduler(wait: bool = True):
    """
    關閉排程器

    Args:
        wait: 是否等待任務完成
    """
    global _scheduler

    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=wait)
        logger.info("ETL Scheduler shutdown")
    _scheduler = None


def get_all_jobs() -> List[Dict[str, Any]]:
    """
    取得所有排程任務資訊

    Returns:
        任務資訊列表
    """
    global _scheduler

    if _scheduler is None:
        return []

    jobs = []
    for job in _scheduler.get_jobs():
        jobs.append({
            'id': job.id,
            'name': job.name,
            'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
            'trigger': str(job.trigger),
            'is_paused': job.next_run_time is None
        })

    return jobs


def get_job(job_id: str) -> Optional[Job]:
    """
    取得單一任務

    Args:
        job_id: 任務 ID

    Returns:
        Job 實例或 None
    """
    global _scheduler

    if _scheduler is None:
        return None

    return _scheduler.get_job(job_id)


def pause_job(job_id: str) -> bool:
    """
    暫停任務

    Args:
        job_id: 任務 ID

    Returns:
        是否成功
    """
    global _scheduler

    if _scheduler is None:
        return False

    job = _scheduler.get_job(job_id)
    if job:
        job.pause()
        logger.info(f"Job paused: {job_id}")
        return True
    return False


def resume_job(job_id: str) -> bool:
    """
    恢復任務

    Args:
        job_id: 任務 ID

    Returns:
        是否成功
    """
    global _scheduler

    if _scheduler is None:
        return False

    job = _scheduler.get_job(job_id)
    if job:
        job.resume()
        logger.info(f"Job resumed: {job_id}")
        return True
    return False


def trigger_job(job_id: str) -> bool:
    """
    立即觸發任務

    Args:
        job_id: 任務 ID

    Returns:
        是否成功
    """
    global _scheduler

    if _scheduler is None:
        return False

    job = _scheduler.get_job(job_id)
    if job:
        job.modify(next_run_time=datetime.now(_scheduler.timezone))
        logger.info(f"Job triggered: {job_id}")
        return True
    return False
