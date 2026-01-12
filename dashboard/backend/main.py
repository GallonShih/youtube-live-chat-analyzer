from fastapi import FastAPI, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from database import get_db_session, get_db_manager
from models import (
    StreamStats, ChatMessage,
    PendingReplaceWord, PendingSpecialWord,
    ReplaceWord, SpecialWord, CurrencyRate
)
from validation import (
    validate_replace_word,
    validate_special_word,
    batch_validate_replace_words,
    batch_validate_special_words
)

import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hermes Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_manager = get_db_manager()

@app.on_event("startup")
async def startup_event():
    try:
        db_manager.create_tables()
        logger.info("✓ Database tables created/verified successfully")
    except Exception as e:
        logger.error(f"Error creating tables on startup: {e}")
        raise

def get_db():
    with get_db_session() as session:
        yield session

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/stats/viewers")
def get_viewer_stats(
    limit: int = 100, 
    hours: int = None, 
    start_time: datetime = None, 
    end_time: datetime = None, 
    db: Session = Depends(get_db)
):
    try:
        query = db.query(StreamStats).order_by(StreamStats.collected_at.desc())
        
        if start_time and end_time:
            query = query.filter(StreamStats.collected_at >= start_time, StreamStats.collected_at <= end_time)
        elif hours:
            since = datetime.utcnow() - timedelta(hours=hours)
            query = query.filter(StreamStats.collected_at >= since)
        else:
            query = query.limit(limit)
            
        stats = query.all()
        
        result = []
        for s in reversed(stats):
            if s.concurrent_viewers is not None:
                result.append({
                    "time": s.collected_at.isoformat(),
                    "count": s.concurrent_viewers
                })
        return result
    except Exception as e:
        logger.error(f"Error fetching viewer stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats/comments")
def get_comment_stats_hourly(
    hours: int = 24, 
    start_time: datetime = None, 
    end_time: datetime = None, 
    db: Session = Depends(get_db)
):
    try:
        if start_time and end_time:
            since = start_time
        else:
            since = datetime.utcnow() - timedelta(hours=hours)
            start_time = since
            end_time = None
        
        trunc_func = func.date_trunc('hour', ChatMessage.published_at)
        
        query = db.query(
            trunc_func.label('hour'),
            func.count(ChatMessage.message_id).label('count')
        ).filter(
            ChatMessage.published_at >= start_time
        )
        
        if end_time:
             query = query.filter(ChatMessage.published_at <= end_time)
             
        results = query.group_by(
            trunc_func
        ).order_by(
            trunc_func
        ).all()
        
        data = []
        for r in results:
            dt = r.hour
            data.append({
                "hour": dt.isoformat(), 
                "count": r.count
            })
            
        return data
    except Exception as e:
        logger.error(f"Error fetching comment stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/messages")
def get_chat_messages(
    limit: int = 100,
    offset: int = 0,
    start_time: datetime = None,
    end_time: datetime = None,
    author_filter: str = None,
    message_filter: str = None,
    paid_message_filter: str = 'all',
    db: Session = Depends(get_db)
):
    try:
        if limit > 500:
            limit = 500
        
        query = db.query(ChatMessage).order_by(ChatMessage.published_at.desc())
        
        if start_time:
            query = query.filter(ChatMessage.published_at >= start_time)
        if end_time:
            query = query.filter(ChatMessage.published_at <= end_time)
        
        if author_filter:
            query = query.filter(ChatMessage.author_name.ilike(f'%{author_filter}%'))
        
        if message_filter:
            query = query.filter(ChatMessage.message.ilike(f'%{message_filter}%'))
        
        if paid_message_filter == 'paid_only':
            query = query.filter(ChatMessage.message_type == 'paid_message')
        elif paid_message_filter == 'non_paid_only':
            query = query.filter(ChatMessage.message_type != 'paid_message')
        
        total = query.count()
        
        messages = query.limit(limit).offset(offset).all()
        
        result = {
            "messages": [
                {
                    "id": msg.message_id,
                    "time": msg.published_at.isoformat() if msg.published_at else None,
                    "author": msg.author_name,
                    "message": msg.message,
                    "emotes": msg.emotes if msg.emotes else [],
                    "message_type": msg.message_type,
                    "money": msg.raw_data.get('money') if msg.raw_data else None
                }
                for msg in messages
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching chat messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/pending-replace-words")
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

@app.get("/api/admin/pending-special-words")
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

@app.post("/api/admin/validate-replace-word")
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

@app.post("/api/admin/validate-special-word")
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

@app.post("/api/admin/approve-replace-word/{word_id}")
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

@app.post("/api/admin/approve-special-word/{word_id}")
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

@app.post("/api/admin/reject-replace-word/{word_id}")
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

@app.post("/api/admin/reject-special-word/{word_id}")
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

@app.post("/api/admin/batch-approve-replace-words")
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

@app.post("/api/admin/batch-reject-replace-words")
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

@app.get("/api/admin/statistics")
def get_admin_statistics(db: Session = Depends(get_db)):
    try:
        pending_replace = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == 'pending'
        ).count()
        
        pending_special = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == 'pending'
        ).count()
        
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
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

@app.post("/api/admin/batch-approve-special-words")
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

@app.post("/api/admin/batch-reject-special-words")
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

@app.post("/api/admin/add-replace-word")
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

@app.post("/api/admin/add-special-word")
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

@app.get("/api/admin/currency-rates")
def get_currency_rates(db: Session = Depends(get_db)):
    try:
        rates = db.query(CurrencyRate).order_by(CurrencyRate.currency).all()
        
        return {
            "rates": [
                {
                    "currency": rate.currency,
                    "rate_to_twd": float(rate.rate_to_twd) if rate.rate_to_twd else 0.0,
                    "updated_at": rate.updated_at.isoformat() if rate.updated_at else None,
                    "notes": rate.notes
                }
                for rate in rates
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching currency rates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/currency-rates")
def upsert_currency_rate(
    currency: str = Body(...),
    rate_to_twd: float = Body(...),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        if not currency or len(currency) > 10:
            raise HTTPException(status_code=400, detail="Invalid currency code")
        
        if rate_to_twd < 0:
            raise HTTPException(status_code=400, detail="Exchange rate must be non-negative")
        
        currency = currency.upper().strip()
        
        existing = db.query(CurrencyRate).filter(
            CurrencyRate.currency == currency
        ).first()
        
        if existing:
            existing.rate_to_twd = rate_to_twd
            existing.notes = notes
            existing.updated_at = func.now()
            message = f"Currency rate for {currency} updated successfully"
        else:
            new_rate = CurrencyRate(
                currency=currency,
                rate_to_twd=rate_to_twd,
                notes=notes
            )
            db.add(new_rate)
            message = f"Currency rate for {currency} added successfully"
        
        db.commit()
        
        return {
            "success": True,
            "message": message,
            "currency": currency,
            "rate_to_twd": rate_to_twd
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error upserting currency rate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/currency-rates/unknown")
def get_unknown_currencies(db: Session = Depends(get_db)):
    try:
        result = db.execute(text("""
            SELECT DISTINCT raw_data->'money'->>'currency' as currency,
                   COUNT(*) as message_count
            FROM chat_messages
            WHERE raw_data->'money' IS NOT NULL
              AND raw_data->'money'->>'currency' IS NOT NULL
            GROUP BY currency
            ORDER BY message_count DESC
        """))
        
        all_currencies = [(row[0], row[1]) for row in result if row[0]]
        
        existing_rates = db.query(CurrencyRate.currency).all()
        existing_currency_set = {rate[0] for rate in existing_rates}
        
        unknown = [
            {
                "currency": curr,
                "message_count": count
            }
            for curr, count in all_currencies
            if curr not in existing_currency_set
        ]
        
        return {
            "unknown_currencies": unknown,
            "total": len(unknown)
        }
        
    except Exception as e:
        logger.error(f"Error fetching unknown currencies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats/money-summary")
def get_money_summary(
    start_time: datetime = None,
    end_time: datetime = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(ChatMessage).filter(
            ChatMessage.message_type == 'paid_message'
        )
        
        if start_time:
            query = query.filter(ChatMessage.published_at >= start_time)
        if end_time:
            query = query.filter(ChatMessage.published_at <= end_time)
        
        messages = query.all()
        
        rates_query = db.query(CurrencyRate).all()
        rate_map = {rate.currency: float(rate.rate_to_twd) if rate.rate_to_twd else 0.0 for rate in rates_query}
        
        total_twd = 0.0
        author_amounts = {}
        unknown_currencies = set()
        paid_count = 0
        
        for msg in messages:
            if not msg.raw_data or 'money' not in msg.raw_data:
                continue
            
            money_data = msg.raw_data.get('money')
            if not money_data:
                continue
            
            currency = money_data.get('currency')
            amount_str = money_data.get('amount')
            
            if not currency or not amount_str:
                continue
            
            try:
                amount_str = str(amount_str).replace(',', '').replace('$', '').strip()
                amount = float(amount_str)
            except (ValueError, TypeError):
                logger.warning(f"Could not parse amount: {amount_str}")
                continue
            
            if currency in rate_map:
                amount_twd = amount * rate_map[currency]
                total_twd += amount_twd
                
                author = msg.author_name or 'Unknown'
                if author not in author_amounts:
                    author_amounts[author] = {'amount_twd': 0.0, 'count': 0}
                
                author_amounts[author]['amount_twd'] += amount_twd
                author_amounts[author]['count'] += 1
                paid_count += 1
            else:
                unknown_currencies.add(currency)
        
        sorted_authors = sorted(
            [
                {
                    'author': author,
                    'amount_twd': round(data['amount_twd'], 2),
                    'message_count': data['count']
                }
                for author, data in author_amounts.items()
            ],
            key=lambda x: x['amount_twd'],
            reverse=True
        )
        
        if len(sorted_authors) > 5:
            fifth_amount = sorted_authors[4]['amount_twd']
            top_authors = [a for a in sorted_authors if a['amount_twd'] >= fifth_amount]
        else:
            top_authors = sorted_authors

        
        return {
            "total_amount_twd": round(total_twd, 2),
            "paid_message_count": paid_count,
            "top_authors": top_authors,
            "unknown_currencies": list(unknown_currencies)
        }
        
    except Exception as e:
        logger.error(f"Error calculating money summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
