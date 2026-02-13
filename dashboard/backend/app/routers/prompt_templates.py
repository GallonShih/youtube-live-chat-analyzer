"""
Prompt Templates Router
AI 提示詞範本管理 API (ORM)
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models import PromptTemplate, ETLSetting

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/etl/prompt-templates", tags=["prompt-templates"])


# Pydantic Models
class PromptTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    template: str = Field(..., min_length=1)


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    template: Optional[str] = Field(None, min_length=1)


class PromptTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    template: str
    is_active: bool
    created_at: str
    updated_at: str
    created_by: str


def _template_to_dict(t: PromptTemplate) -> dict:
    """Convert PromptTemplate ORM object to response dict."""
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "template": t.template,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "created_by": t.created_by,
    }


def _template_to_response(t: PromptTemplate) -> PromptTemplateResponse:
    """Convert PromptTemplate ORM object to PromptTemplateResponse."""
    return PromptTemplateResponse(
        id=t.id,
        name=t.name,
        description=t.description,
        template=t.template,
        is_active=t.is_active,
        created_at=t.created_at.isoformat() if t.created_at else "",
        updated_at=t.updated_at.isoformat() if t.updated_at else "",
        created_by=t.created_by,
    )


@router.get("")
def list_templates(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """列出所有提示詞範本"""
    try:
        templates = db.query(PromptTemplate).order_by(
            PromptTemplate.is_active.desc(),
            PromptTemplate.name.asc()
        ).all()

        return {
            "templates": [_template_to_dict(t) for t in templates],
            "total": len(templates),
        }

    except Exception as e:
        logger.error(f"Error listing prompt templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db)) -> PromptTemplateResponse:
    """取得單一提示詞範本"""
    try:
        template = db.query(PromptTemplate).filter(
            PromptTemplate.id == template_id
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        return _template_to_response(template)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting prompt template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", dependencies=[Depends(require_admin)])
def create_template(
    data: PromptTemplateCreate,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """建立新的提示詞範本"""
    try:
        # 檢查名稱是否重複
        existing = db.query(PromptTemplate).filter(
            PromptTemplate.name == data.name
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Template name '{data.name}' already exists")

        # 插入新範本
        template = PromptTemplate(
            name=data.name,
            description=data.description,
            template=data.template,
            is_active=False,
            created_by='admin',
        )
        db.add(template)
        db.commit()
        db.refresh(template)

        logger.info(f"Created prompt template: {data.name}")

        return {
            "success": True,
            "template": _template_to_dict(template),
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating prompt template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{template_id}", dependencies=[Depends(require_admin)])
def update_template(
    template_id: int,
    data: PromptTemplateUpdate,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """更新提示詞範本"""
    try:
        template = db.query(PromptTemplate).filter(
            PromptTemplate.id == template_id
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        # 如果有更新名稱，檢查是否重複
        if data.name:
            conflict = db.query(PromptTemplate).filter(
                PromptTemplate.name == data.name,
                PromptTemplate.id != template_id
            ).first()
            if conflict:
                raise HTTPException(status_code=400, detail=f"Template name '{data.name}' already exists")

        # 更新欄位
        has_update = False
        if data.name is not None:
            template.name = data.name
            has_update = True
        if data.description is not None:
            template.description = data.description
            has_update = True
        if data.template is not None:
            template.template = data.template
            has_update = True

        if not has_update:
            raise HTTPException(status_code=400, detail="No fields to update")

        db.commit()

        logger.info(f"Updated prompt template {template_id}")

        return {
            "success": True,
            "template_id": template_id,
            "message": f"Template {template_id} updated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating prompt template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{template_id}", dependencies=[Depends(require_admin)])
def delete_template(template_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """刪除提示詞範本"""
    try:
        template = db.query(PromptTemplate).filter(
            PromptTemplate.id == template_id
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        # 不允許刪除啟用中的範本
        if template.is_active:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete active template. Please activate another template first."
            )

        db.delete(template)
        db.commit()

        logger.info(f"Deleted prompt template {template_id}")

        return {
            "success": True,
            "template_id": template_id,
            "message": f"Template {template_id} deleted successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting prompt template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{template_id}/activate", dependencies=[Depends(require_admin)])
def activate_template(template_id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """啟用提示詞範本（同時停用其他範本）"""
    try:
        template = db.query(PromptTemplate).filter(
            PromptTemplate.id == template_id
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")

        # 停用所有範本
        db.query(PromptTemplate).update({PromptTemplate.is_active: False})

        # 啟用指定範本
        template.is_active = True

        # 更新 etl_settings
        etl_setting = db.query(ETLSetting).filter(
            ETLSetting.key == 'ACTIVE_PROMPT_TEMPLATE_ID'
        ).first()
        if etl_setting:
            etl_setting.value = str(template_id)

        db.commit()

        logger.info(f"Activated prompt template {template_id}")

        return {
            "success": True,
            "template_id": template_id,
            "message": f"Template {template_id} activated successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error activating prompt template {template_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active/current")
def get_active_template(db: Session = Depends(get_db)) -> PromptTemplateResponse:
    """取得目前啟用的提示詞範本"""
    try:
        template = db.query(PromptTemplate).filter(
            PromptTemplate.is_active == True
        ).first()

        if not template:
            raise HTTPException(status_code=404, detail="No active template found")

        return _template_to_response(template)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting active prompt template: {e}")
        raise HTTPException(status_code=500, detail=str(e))
