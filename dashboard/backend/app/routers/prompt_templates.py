"""
Prompt Templates Router
AI 提示詞範本管理 API
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin

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


@router.get("")
def list_templates(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    列出所有提示詞範本
    
    Returns:
        範本列表
    """
    try:
        result = db.execute(text("""
            SELECT id, name, description, template, is_active, 
                   created_at, updated_at, created_by
            FROM prompt_templates
            ORDER BY is_active DESC, name ASC
        """))
        rows = result.fetchall()
        
        templates = []
        for row in rows:
            templates.append({
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "template": row[3],
                "is_active": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "updated_at": row[6].isoformat() if row[6] else None,
                "created_by": row[7]
            })
        
        return {"templates": templates, "total": len(templates)}
    
    except Exception as e:
        logger.error(f"Error listing prompt templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{template_id}")
def get_template(template_id: int, db: Session = Depends(get_db)) -> PromptTemplateResponse:
    """
    取得單一提示詞範本
    
    Args:
        template_id: 範本 ID
    
    Returns:
        範本詳情
    """
    try:
        result = db.execute(
            text("""
                SELECT id, name, description, template, is_active, 
                       created_at, updated_at, created_by
                FROM prompt_templates
                WHERE id = :template_id
            """),
            {"template_id": template_id}
        )
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        return PromptTemplateResponse(
            id=row[0],
            name=row[1],
            description=row[2],
            template=row[3],
            is_active=row[4],
            created_at=row[5].isoformat() if row[5] else "",
            updated_at=row[6].isoformat() if row[6] else "",
            created_by=row[7]
        )
    
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
    """
    建立新的提示詞範本
    
    Args:
        data: 範本資料
    
    Returns:
        建立成功的範本
    """
    try:
        # 檢查名稱是否重複
        result = db.execute(
            text("SELECT id FROM prompt_templates WHERE name = :name"),
            {"name": data.name}
        )
        if result.fetchone():
            raise HTTPException(status_code=400, detail=f"Template name '{data.name}' already exists")
        
        # 插入新範本
        result = db.execute(
            text("""
                INSERT INTO prompt_templates (name, description, template, is_active, created_by)
                VALUES (:name, :description, :template, false, 'admin')
                RETURNING id, name, description, template, is_active, created_at, updated_at, created_by
            """),
            {
                "name": data.name,
                "description": data.description,
                "template": data.template
            }
        )
        row = result.fetchone()
        db.commit()
        
        logger.info(f"Created prompt template: {data.name}")
        
        return {
            "success": True,
            "template": {
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "template": row[3],
                "is_active": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "updated_at": row[6].isoformat() if row[6] else None,
                "created_by": row[7]
            }
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
    """
    更新提示詞範本
    
    Args:
        template_id: 範本 ID
        data: 更新資料
    
    Returns:
        更新結果
    """
    try:
        # 檢查範本是否存在
        result = db.execute(
            text("SELECT id FROM prompt_templates WHERE id = :template_id"),
            {"template_id": template_id}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        # 如果有更新名稱，檢查是否重複
        if data.name:
            result = db.execute(
                text("SELECT id FROM prompt_templates WHERE name = :name AND id != :template_id"),
                {"name": data.name, "template_id": template_id}
            )
            if result.fetchone():
                raise HTTPException(status_code=400, detail=f"Template name '{data.name}' already exists")
        
        # 構建更新語句
        update_fields = []
        params = {"template_id": template_id}
        
        if data.name is not None:
            update_fields.append("name = :name")
            params["name"] = data.name
        
        if data.description is not None:
            update_fields.append("description = :description")
            params["description"] = data.description
        
        if data.template is not None:
            update_fields.append("template = :template")
            params["template"] = data.template
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = NOW()")
        
        db.execute(
            text(f"""
                UPDATE prompt_templates
                SET {", ".join(update_fields)}
                WHERE id = :template_id
            """),
            params
        )
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
    """
    刪除提示詞範本
    
    Args:
        template_id: 範本 ID
    
    Returns:
        刪除結果
    """
    try:
        # 檢查範本是否存在
        result = db.execute(
            text("SELECT is_active FROM prompt_templates WHERE id = :template_id"),
            {"template_id": template_id}
        )
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        # 不允許刪除啟用中的範本
        if row[0]:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete active template. Please activate another template first."
            )
        
        # 刪除範本
        db.execute(
            text("DELETE FROM prompt_templates WHERE id = :template_id"),
            {"template_id": template_id}
        )
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
    """
    啟用提示詞範本（同時停用其他範本）
    
    Args:
        template_id: 範本 ID
    
    Returns:
        啟用結果
    """
    try:
        # 檢查範本是否存在
        result = db.execute(
            text("SELECT id FROM prompt_templates WHERE id = :template_id"),
            {"template_id": template_id}
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail=f"Template {template_id} not found")
        
        # 停用所有範本
        db.execute(text("UPDATE prompt_templates SET is_active = false"))
        
        # 啟用指定範本
        db.execute(
            text("UPDATE prompt_templates SET is_active = true, updated_at = NOW() WHERE id = :template_id"),
            {"template_id": template_id}
        )
        
        # 更新 etl_settings
        db.execute(
            text("UPDATE etl_settings SET value = :template_id WHERE key = 'ACTIVE_PROMPT_TEMPLATE_ID'"),
            {"template_id": str(template_id)}
        )
        
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
    """
    取得目前啟用的提示詞範本
    
    Returns:
        啟用的範本
    """
    try:
        result = db.execute(text("""
            SELECT id, name, description, template, is_active, 
                   created_at, updated_at, created_by
            FROM prompt_templates
            WHERE is_active = true
            LIMIT 1
        """))
        row = result.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="No active template found")
        
        return PromptTemplateResponse(
            id=row[0],
            name=row[1],
            description=row[2],
            template=row[3],
            is_active=row[4],
            created_at=row[5].isoformat() if row[5] else "",
            updated_at=row[6].isoformat() if row[6] else "",
            created_by=row[7]
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting active prompt template: {e}")
        raise HTTPException(status_code=500, detail=str(e))
