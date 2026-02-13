"""
ETL Jobs Router
ETL 任務管理 API
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List, Dict, Any, Optional
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.etl.scheduler import (
    get_scheduler,
    get_all_jobs,
    get_job,
    pause_job,
    resume_job,
    trigger_job,
)
from app.etl.tasks import TASK_REGISTRY, MANUAL_TASKS
from app.models import ETLExecutionLog, ETLSetting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/etl", tags=["etl-jobs"])


@router.get("/jobs")
def list_jobs() -> Dict[str, Any]:
    """
    列出所有 ETL 任務

    Returns:
        - scheduled: 排程任務列表
        - manual: 手動任務列表
    """
    try:
        # 取得排程任務
        scheduled_jobs = get_all_jobs()

        # 取得手動任務
        manual_jobs = MANUAL_TASKS

        return {
            "scheduled": scheduled_jobs,
            "manual": manual_jobs
        }
    except Exception as e:
        logger.error(f"Error listing jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
def get_job_detail(job_id: str) -> Dict[str, Any]:
    """
    取得單一任務詳情

    Args:
        job_id: 任務 ID

    Returns:
        任務詳情
    """
    try:
        job = get_job(job_id)

        if not job:
            # 檢查是否為手動任務
            manual_job = next((j for j in MANUAL_TASKS if j['id'] == job_id), None)
            if manual_job:
                return manual_job
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

        return {
            "id": job.id,
            "name": job.name,
            "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger),
            "is_paused": job.next_run_time is None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/trigger", dependencies=[Depends(require_admin)])
async def trigger_job_endpoint(
    job_id: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    手動觸發任務
    
    1. 創建 'running' 狀態記錄到 etl_execution_log（trigger_type='manual'）
    2. 在背景執行任務，傳入 etl_log_id
    3. 任務完成時更新狀態為 'completed' 或 'failed'

    Args:
        job_id: 任務 ID
        db: 資料庫連線

    Returns:
        觸發結果，包含 etl_log_id
    """
    try:
        # 檢查任務是否存在於註冊表
        if job_id not in TASK_REGISTRY:
            raise HTTPException(status_code=404, detail=f"Task '{job_id}' not found")

        # 1. 創建 ETL 記錄
        from app.etl.tasks import create_etl_log, update_etl_log_status
        
        etl_log_id = create_etl_log(job_id, trigger_type='manual')
        if not etl_log_id:
            raise HTTPException(status_code=500, detail="Failed to create ETL log")
        
        logger.info(f"Created ETL log: {job_id} (etl_log_id={etl_log_id})")

        # 2. 檢查是否已經在執行
        if hasattr(trigger_job_endpoint, '_running_jobs'):
            running_jobs = trigger_job_endpoint._running_jobs
        else:
            trigger_job_endpoint._running_jobs = set()
            running_jobs = trigger_job_endpoint._running_jobs
        
        if job_id in running_jobs:
            update_etl_log_status(etl_log_id, 'skipped', error_message='Skipped: task is already running on this worker')
            return {
                "success": False,
                "status": "already_running",
                "job_id": job_id,
                "etl_log_id": etl_log_id,
                "message": f"任務 '{job_id}' 已經在執行中，請稍候再試"
            }
        
        # 3. 直接在背景執行，傳入 etl_log_id
        # 注意：不使用 APScheduler 觸發，因為它無法傳遞 etl_log_id 參數
        from concurrent.futures import ThreadPoolExecutor
        
        running_jobs.add(job_id)
        executor = ThreadPoolExecutor(max_workers=1)
        task_func = TASK_REGISTRY[job_id]
        
        def wrapped_task():
            try:
                task_func(etl_log_id=etl_log_id)
            finally:
                running_jobs.discard(job_id)
        
        executor.submit(wrapped_task)

        logger.info(f"Task '{job_id}' triggered manually (etl_log_id={etl_log_id})")

        return {
            "success": True,
            "status": "running",
            "job_id": job_id,
            "etl_log_id": etl_log_id,
            "triggered_at": datetime.now().isoformat(),
            "message": f"任務 '{job_id}' 已開始在背景執行"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/pause", dependencies=[Depends(require_admin)])
def pause_job_endpoint(job_id: str) -> Dict[str, Any]:
    """
    暫停排程任務

    Args:
        job_id: 任務 ID

    Returns:
        操作結果
    """
    try:
        if pause_job(job_id):
            return {
                "success": True,
                "job_id": job_id,
                "status": "paused",
                "message": f"任務 '{job_id}' 已暫停"
            }
        else:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/resume", dependencies=[Depends(require_admin)])
def resume_job_endpoint(job_id: str) -> Dict[str, Any]:
    """
    恢復排程任務

    Args:
        job_id: 任務 ID

    Returns:
        操作結果
    """
    try:
        if resume_job(job_id):
            # 取得更新後的下次執行時間
            job = get_job(job_id)
            next_run = job.next_run_time.isoformat() if job and job.next_run_time else None

            return {
                "success": True,
                "job_id": job_id,
                "status": "resumed",
                "next_run_time": next_run,
                "message": f"任務 '{job_id}' 已恢復"
            }
        else:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming job {job_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/logs")
def get_execution_logs(
    job_id: Optional[str] = Query(None, description="篩選特定任務"),
    status: Optional[str] = Query(None, description="篩選狀態"),
    limit: int = Query(50, ge=1, le=200, description="返回數量"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    取得 ETL 執行記錄
    
    所有任務狀態（running, completed, failed, skipped）都記錄在 etl_execution_log

    Args:
        job_id: 篩選特定任務
        status: 篩選狀態 (running, completed, failed, skipped)
        limit: 返回數量

    Returns:
        執行記錄列表
    """
    try:
        query = db.query(ETLExecutionLog)

        if job_id:
            query = query.filter(ETLExecutionLog.job_id == job_id)
        if status:
            query = query.filter(ETLExecutionLog.status == status)

        rows = query.order_by(ETLExecutionLog.started_at.desc()).limit(limit).all()

        logs = []
        for row in rows:
            logs.append({
                "id": row.id,
                "job_id": row.job_id,
                "job_name": row.job_name,
                "status": row.status,
                "trigger_type": row.trigger_type or "scheduled",
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "completed_at": row.completed_at.isoformat() if row.completed_at else None,
                "duration_seconds": row.duration_seconds,
                "records_processed": row.records_processed,
                "error_message": row.error_message
            })

        return {"logs": logs, "total": len(logs)}

    except Exception as e:
        logger.error(f"Error fetching execution logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings")
def get_etl_settings(
    category: Optional[str] = Query(None, description="篩選分類"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    取得 ETL 設定

    Args:
        category: 篩選分類 (api, etl, import, ai)

    Returns:
        設定列表
    """
    try:
        query = db.query(ETLSetting)

        if category:
            query = query.filter(ETLSetting.category == category)

        rows = query.order_by(ETLSetting.category, ETLSetting.key).all()

        settings = []
        for row in rows:
            settings.append({
                "key": row.key,
                "value": "******" if row.is_sensitive and row.value else row.value,
                "value_type": row.value_type,
                "description": row.description,
                "is_sensitive": row.is_sensitive,
                "category": row.category,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None
            })

        return {"settings": settings}

    except Exception as e:
        logger.error(f"Error fetching ETL settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/settings/{key}", dependencies=[Depends(require_admin)])
def update_etl_setting(
    key: str,
    value: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    更新 ETL 設定

    Args:
        key: 設定鍵名
        value: 新值

    Returns:
        更新結果
    """
    try:
        setting = db.query(ETLSetting).filter(ETLSetting.key == key).first()

        if not setting:
            raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")

        setting.value = value
        setting.updated_at = func.now()
        db.commit()

        logger.info(f"ETL setting '{key}' updated")

        return {
            "success": True,
            "key": key,
            "message": f"設定 '{key}' 已更新"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating ETL setting {key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def get_scheduler_status() -> Dict[str, Any]:
    """
    取得排程器狀態

    Returns:
        排程器狀態資訊
    """
    try:
        scheduler = get_scheduler()

        if scheduler is None:
            return {
                "status": "not_initialized",
                "running": False,
                "jobs_count": 0
            }

        jobs = scheduler.get_jobs()

        return {
            "status": "running" if scheduler.running else "stopped",
            "running": scheduler.running,
            "jobs_count": len(jobs),
            "jobs": [
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None
                }
                for job in jobs
            ]
        }
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))
