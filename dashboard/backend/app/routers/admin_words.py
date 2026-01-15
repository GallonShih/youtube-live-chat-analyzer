from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone
import logging

from app.core.database import get_db
from app.models import (
    PendingReplaceWord, PendingSpecialWord,
    ReplaceWord, SpecialWord
)
from app.services.validation import (
    validate_replace_word,
    validate_special_word,
    batch_validate_replace_words,
    batch_validate_special_words
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin-words"])

@router.get("/pending-replace-words")
def get_pending_replace_words(
    status: str = 'pending',
    limit: int = 50,
    offset: int = 0,
    sort_by: str = 'confidence',
    order: str = 'desc',
    source_word_filter: str = '',
    target_word_filter: str = '',
    db: Session = Depends(get_db)
):
    try:
        query = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == status
        )
        
        if source_word_filter:
            query = query.filter(PendingReplaceWord.source_word.ilike(f'%{source_word_filter}%'))
        if target_word_filter:
            query = query.filter(PendingReplaceWord.target_word.ilike(f'%{target_word_filter}%'))
        
        if sort_by == 'confidence':
            order_col = PendingReplaceWord.confidence_score
        elif sort_by == 'occurrence':
            order_col = PendingReplaceWord.occurrence_count
        else:
            order_col = PendingReplaceWord.discovered_at
        
        if order == 'asc':
            query = query.order_by(order_col.asc())
        else:
            query = query.order_by(order_col.desc())
        
        total = query.count()
        items = query.limit(limit).offset(offset).all()
        
        result = {
            "items": [
                {
                    "id": item.id,
                    "source_word": item.source_word,
                    "target_word": item.target_word,
                    "confidence_score": float(item.confidence_score) if item.confidence_score else None,
                    "occurrence_count": item.occurrence_count,
                    "example_messages": item.example_messages if item.example_messages else [],
                    "discovered_at": item.discovered_at.isoformat() if item.discovered_at else None,
                    "status": item.status,
                    "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
                    "reviewed_by": item.reviewed_by,
                    "notes": item.notes
                }
                for item in items
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching pending replace words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/pending-special-words")
def get_pending_special_words(
    status: str = 'pending',
    limit: int = 50,
    offset: int = 0,
    sort_by: str = 'confidence',
    order: str = 'desc',
    word_filter: str = '',
    db: Session = Depends(get_db)
):
    try:
        query = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == status
        )
        
        if word_filter:
            query = query.filter(PendingSpecialWord.word.ilike(f'%{word_filter}%'))
        
        if sort_by == 'confidence':
            order_col = PendingSpecialWord.confidence_score
        elif sort_by == 'occurrence':
            order_col = PendingSpecialWord.occurrence_count
        else:
            order_col = PendingSpecialWord.discovered_at
        
        if order == 'asc':
            query = query.order_by(order_col.asc())
        else:
            query = query.order_by(order_col.desc())
        
        total = query.count()
        items = query.limit(limit).offset(offset).all()
        
        result = {
            "items": [
                {
                    "id": item.id,
                    "word": item.word,
                    "word_type": item.word_type,
                    "confidence_score": float(item.confidence_score) if item.confidence_score else None,
                    "occurrence_count": item.occurrence_count,
                    "example_messages": item.example_messages if item.example_messages else [],
                    "discovered_at": item.discovered_at.isoformat() if item.discovered_at else None,
                    "status": item.status,
                    "reviewed_at": item.reviewed_at.isoformat() if item.reviewed_at else None,
                    "reviewed_by": item.reviewed_by,
                    "notes": item.notes
                }
                for item in items
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching pending special words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-replace-word")
def validate_pending_replace_word(
    source_word: str = Body(...),
    target_word: str = Body(...),
    pending_id: int = Body(None),
    db: Session = Depends(get_db)
):
    try:
        validation_result = validate_replace_word(
            db, source_word, target_word, pending_id
        )
        return validation_result
    except Exception as e:
        logger.error(f"Error validating replace word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate-special-word")
def validate_pending_special_word(
    word: str = Body(...),
    pending_id: int = Body(None),
    db: Session = Depends(get_db)
):
    try:
        validation_result = validate_special_word(
            db, word, pending_id
        )
        return validation_result
    except Exception as e:
        logger.error(f"Error validating special word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve-replace-word/{word_id}")
def approve_replace_word(
    word_id: int,
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        pending = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        validation = validate_replace_word(
            db, pending.source_word, pending.target_word, word_id
        )
        
        if not validation['valid']:
            return {
                "success": False,
                "message": "驗證失敗，存在衝突",
                "validation": validation
            }
        
        pending.status = 'approved'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        existing = db.query(ReplaceWord).filter(
            ReplaceWord.source_word == pending.source_word
        ).first()
        
        if existing:
            existing.target_word = pending.target_word
            existing.updated_at = func.now()
        else:
            new_word = ReplaceWord(
                source_word=pending.source_word,
                target_word=pending.target_word
            )
            db.add(new_word)
        
        db.commit()
        
        return {
            "success": True,
            "message": "替換詞彙已批准並加入正式表",
            "word": {
                "source_word": pending.source_word,
                "target_word": pending.target_word
            },
            "validation": validation
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving replace word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/approve-special-word/{word_id}")
def approve_special_word(
    word_id: int,
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        pending = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        validation = validate_special_word(db, pending.word, word_id)
        
        if not validation['valid']:
            return {
                "success": False,
                "message": "驗證失敗，存在衝突",
                "validation": validation
            }
        
        pending.status = 'approved'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        existing = db.query(SpecialWord).filter(
            SpecialWord.word == pending.word
        ).first()
        
        if not existing:
            new_word = SpecialWord(word=pending.word)
            db.add(new_word)
        
        db.commit()
        
        return {
            "success": True,
            "message": "特殊詞彙已批准並加入正式表",
            "word": {
                "word": pending.word,
                "type": pending.word_type
            },
            "validation": validation
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving special word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reject-replace-word/{word_id}")
def reject_replace_word(
    word_id: int,
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        pending = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        pending.status = 'rejected'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        db.commit()
        
        return {
            "success": True,
            "message": "替換詞彙已否決",
            "word": {
                "source_word": pending.source_word,
                "target_word": pending.target_word
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error rejecting replace word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reject-special-word/{word_id}")
def reject_special_word(
    word_id: int,
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        pending = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        pending.status = 'rejected'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        db.commit()
        
        return {
            "success": True,
            "message": "特殊詞彙已否決",
            "word": {
                "word": pending.word
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error rejecting special word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-approve-replace-words")
def batch_approve_replace_words(
    ids: List[int] = Body(...),
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        validations = batch_validate_replace_words(db, ids)
        
        approved = 0
        failed = 0
        errors = []
        
        for word_id in ids:
            validation = validations.get(word_id, {})
            
            if not validation.get('valid', False):
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "驗證失敗: " + str(validation.get('conflicts', []))
                })
                continue
            
            pending = db.query(PendingReplaceWord).filter(
                PendingReplaceWord.id == word_id
            ).first()
            
            if not pending:
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "找不到待審核詞彙"
                })
                continue
            
            pending.status = 'approved'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            
            existing = db.query(ReplaceWord).filter(
                ReplaceWord.source_word == pending.source_word
            ).first()
            
            if existing:
                existing.target_word = pending.target_word
                existing.updated_at = func.now()
            else:
                new_word = ReplaceWord(
                    source_word=pending.source_word,
                    target_word=pending.target_word
                )
                db.add(new_word)
            
            approved += 1
        
        db.commit()
        
        return {
            "success": True,
            "approved": approved,
            "failed": failed,
            "errors": errors
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error batch approving replace words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-reject-replace-words")
def batch_reject_replace_words(
    ids: List[int] = Body(...),
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        rejected = 0
        failed = 0
        errors = []
        
        for word_id in ids:
            pending = db.query(PendingReplaceWord).filter(
                PendingReplaceWord.id == word_id
            ).first()
            
            if not pending:
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "找不到待審核詞彙"
                })
                continue
            
            pending.status = 'rejected'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            rejected += 1
        
        db.commit()
        
        return {
            "success": True,
            "rejected": rejected,
            "failed": failed,
            "errors": errors
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error batch rejecting replace words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
def get_admin_statistics(db: Session = Depends(get_db)):
    try:
        pending_replace = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == 'pending'
        ).count()
        
        pending_special = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == 'pending'
        ).count()
        
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        approved_replace_today = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == 'approved',
            PendingReplaceWord.reviewed_at >= today_start
        ).count()
        
        approved_special_today = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == 'approved',
            PendingSpecialWord.reviewed_at >= today_start
        ).count()
        
        rejected_replace_today = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == 'rejected',
            PendingReplaceWord.reviewed_at >= today_start
        ).count()
        
        rejected_special_today = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == 'rejected',
            PendingSpecialWord.reviewed_at >= today_start
        ).count()
        
        total_replace = db.query(ReplaceWord).count()
        total_special = db.query(SpecialWord).count()
        
        return {
            "pending_replace_words": pending_replace,
            "pending_special_words": pending_special,
            "approved_replace_words_today": approved_replace_today,
            "approved_special_words_today": approved_special_today,
            "rejected_replace_words_today": rejected_replace_today,
            "rejected_special_words_today": rejected_special_today,
            "total_replace_words": total_replace,
            "total_special_words": total_special
        }
        
    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-approve-special-words")
def batch_approve_special_words(
    ids: List[int] = Body(...),
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        validations = batch_validate_special_words(db, ids)
        
        approved = 0
        failed = 0
        errors = []
        
        for word_id in ids:
            validation = validations.get(word_id, {})
            
            if not validation.get('valid', False):
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "驗證失敗: " + str(validation.get('conflicts', []))
                })
                continue
            
            pending = db.query(PendingSpecialWord).filter(
                PendingSpecialWord.id == word_id
            ).first()
            
            if not pending:
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "找不到待審核詞彙"
                })
                continue
            
            pending.status = 'approved'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            
            existing = db.query(SpecialWord).filter(
                SpecialWord.word == pending.word
            ).first()
            
            if not existing:
                new_word = SpecialWord(word=pending.word)
                db.add(new_word)
            
            approved += 1
        
        db.commit()
        
        return {
            "success": True,
            "approved": approved,
            "failed": failed,
            "errors": errors
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error batch approving special words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-reject-special-words")
def batch_reject_special_words(
    ids: List[int] = Body(...),
    reviewed_by: str = Body('admin'),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        rejected = 0
        failed = 0
        errors = []
        
        for word_id in ids:
            pending = db.query(PendingSpecialWord).filter(
                PendingSpecialWord.id == word_id
            ).first()
            
            if not pending:
                failed += 1
                errors.append({
                    "id": word_id,
                    "error": "找不到待審核詞彙"
                })
                continue
            
            pending.status = 'rejected'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            rejected += 1
        
        db.commit()
        
        return {
            "success": True,
            "rejected": rejected,
            "failed": failed,
            "errors": errors
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error batch rejecting special words: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/add-replace-word")
def add_replace_word(
    source_word: str = Body(...),
    target_word: str = Body(...),
    db: Session = Depends(get_db)
):
    try:
        validation_result = validate_replace_word(
            db, source_word, target_word, pending_id=None
        )
        
        if not validation_result['valid']:
            return {
                "success": False,
                "message": "Validation failed",
                "conflicts": validation_result['conflicts']
            }
        
        existing = db.query(ReplaceWord).filter(
            ReplaceWord.source_word == source_word,
            ReplaceWord.target_word == target_word
        ).first()
        
        if existing:
            return {
                "success": False,
                "message": "Replace word already exists"
            }
        
        new_word = ReplaceWord(
            source_word=source_word,
            target_word=target_word
        )
        db.add(new_word)
        db.commit()
        db.refresh(new_word)
        
        logger.info(f"Manually added replace word: {source_word} -> {target_word}")
        return {
            "success": True,
            "message": "Replace word added successfully",
            "word": {
                "id": new_word.id,
                "source_word": new_word.source_word,
                "target_word": new_word.target_word
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding replace word: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/add-special-word")
def add_special_word(
    word: str = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    try:
        validation_result = validate_special_word(db, word, pending_id=None)
        
        if not validation_result['valid']:
            return {
                "success": False,
                "message": "Validation failed",
                "conflicts": validation_result['conflicts']
            }
        
        existing = db.query(SpecialWord).filter(
            SpecialWord.word == word
        ).first()
        
        if existing:
            return {
                "success": False,
                "message": "Special word already exists"
            }
        
        new_word = SpecialWord(
            word=word
        )
        db.add(new_word)
        db.commit()
        db.refresh(new_word)
        
        logger.info(f"Manually added special word: {word}")
        return {
            "success": True,
            "message": "Special word added successfully",
            "word": {
                "id": new_word.id,
                "word": new_word.word
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding special word: {e}")
        raise HTTPException(status_code=500, detail=str(e))
