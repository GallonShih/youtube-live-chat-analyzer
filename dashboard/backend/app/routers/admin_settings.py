from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models import SystemSetting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin-settings"])

SETTING_DESCRIPTIONS = {
    "youtube_url": "YouTube 直播 URL",
}

@router.get("/settings")
def get_all_settings(db: Session = Depends(get_db)):
    try:
        settings = db.query(SystemSetting).order_by(SystemSetting.key).all()
        
        return {
            "settings": [
                {
                    "key": s.key,
                    "value": s.value,
                    "description": s.description,
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None
                }
                for s in settings
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/settings/{key}")
def get_setting(key: str, db: Session = Depends(get_db)):
    try:
        setting = db.query(SystemSetting).filter(
            SystemSetting.key == key
        ).first()
        
        if not setting:
            return {
                "key": key,
                "value": None,
                "description": SETTING_DESCRIPTIONS.get(key, ""),
                "updated_at": None
            }
        
        return {
            "key": setting.key,
            "value": setting.value,
            "description": setting.description,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None
        }
    except Exception as e:
        logger.error(f"Error fetching setting {key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/settings", dependencies=[Depends(require_admin)])
def upsert_setting(
    key: str = Body(...),
    value: str = Body(...),
    description: Optional[str] = Body(None),
    db: Session = Depends(get_db)
):
    try:
        if not key or len(key) > 100:
            raise HTTPException(status_code=400, detail="Invalid key")
        
        key = key.lower().strip()
        
        existing = db.query(SystemSetting).filter(
            SystemSetting.key == key
        ).first()
        
        if existing:
            existing.value = value
            if description is not None:
                existing.description = description
            existing.updated_at = func.now()
            message = f"Setting '{key}' updated successfully"
        else:
            new_setting = SystemSetting(
                key=key,
                value=value,
                description=description or SETTING_DESCRIPTIONS.get(key, "")
            )
            db.add(new_setting)
            message = f"Setting '{key}' created successfully"
        
        db.commit()
        
        return {
            "success": True,
            "message": message,
            "key": key,
            "value": value
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error upserting setting: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/settings/{key}", dependencies=[Depends(require_admin)])
def delete_setting(key: str, db: Session = Depends(get_db)):
    try:
        setting = db.query(SystemSetting).filter(
            SystemSetting.key == key
        ).first()
        
        if not setting:
            raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
        
        db.delete(setting)
        db.commit()
        
        return {
            "success": True,
            "message": f"Setting '{key}' deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting setting: {e}")
        raise HTTPException(status_code=500, detail=str(e))
