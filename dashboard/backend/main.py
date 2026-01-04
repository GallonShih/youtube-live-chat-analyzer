from fastapi import FastAPI, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from database import get_db_session, get_db_manager
from models import (
    StreamStats, ChatMessage,
    PendingReplaceWord, PendingSpecialWord,
    ReplaceWord, SpecialWord
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

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hermes Dashboard API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. In production, be more specific.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB
db_manager = get_db_manager()

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
    """
    Get recent concurrent viewer stats.
    Returns list of {time: str, count: int}
    """
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
        
        # Reverse to show chronological order
        result = []
        for s in reversed(stats):
            if s.concurrent_viewers is not None:
                result.append({
                    "time": s.collected_at.isoformat(), # Return ISO string for Chart.js parsing
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
    """
    Get comment counts per hour.
    Returns list of {hour: str, count: int}
    """
    try:
        if start_time and end_time:
            since = start_time
            # For consistent filtering in the query below, we might need to handle end_time 
            # query logic is >= since. If using range, we need separate logic or adjust variable names.
            # Let's adjust the filtering logic below directly.
            pass 
        else:
            since = datetime.utcnow() - timedelta(hours=hours)
            start_time = since # use start_time as common variable for query filter start
            end_time = None # Open ended unless specified
        
        # Determine the database type to use appropriate date truncation function
        # Since we know it's Postgres from requirements and docker-compose
        trunc_func = func.date_trunc('hour', ChatMessage.published_at)
        
        # Query
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
            # Shift to local time if needed? keeping UTC for simplicity or adding +8 for Taipei?
            # User is likely in Taipei (+8). Ideally frontend handles timezone, but backend sending ISO string is best.
            # Here we just format as string.
            dt = r.hour
            # Simple conversion to +8 for display consistency with user context if desired, 
            # but standard is to return ISO and let frontend format. 
            # However, user's React example used `d.hour`.
            # Let's return full ISO string for the frontend to format.
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
    db: Session = Depends(get_db)
):
    """
    Get chat messages with pagination and optional filtering.
    Returns messages in descending order (newest first).
    
    Args:
        limit: Number of messages to return (max 500)
        offset: Pagination offset
        start_time: Filter messages from this time onwards (UTC)
        end_time: Filter messages up to this time (UTC)
        author_filter: Filter by author name (case-insensitive, fuzzy match)
        message_filter: Filter by message content (case-insensitive, fuzzy match)
    
    Returns:
        {
            "messages": [...],
            "total": int,
            "limit": int,
            "offset": int
        }
    """
    try:
        # Enforce max limit
        if limit > 500:
            limit = 500
        
        # Base query
        query = db.query(ChatMessage).order_by(ChatMessage.published_at.desc())
        
        # Apply time filters
        if start_time:
            query = query.filter(ChatMessage.published_at >= start_time)
        if end_time:
            query = query.filter(ChatMessage.published_at <= end_time)
        
        # Apply author filter (case-insensitive fuzzy match)
        if author_filter:
            query = query.filter(ChatMessage.author_name.ilike(f'%{author_filter}%'))
        
        # Apply message filter (case-insensitive fuzzy match, supports emoji)
        if message_filter:
            query = query.filter(ChatMessage.message.ilike(f'%{message_filter}%'))
        
        # Get total count for pagination (before limit/offset)
        total = query.count()
        
        # Apply pagination
        messages = query.limit(limit).offset(offset).all()
        
        # Format response
        result = {
            "messages": [
                {
                    "id": msg.message_id,
                    "time": msg.published_at.isoformat() if msg.published_at else None,
                    "author": msg.author_name,
                    "message": msg.message,
                    "emotes": msg.emotes if msg.emotes else []
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

# ============================================
# Admin API Endpoints for Word Review System
# ============================================

@app.get("/api/admin/pending-replace-words")
def get_pending_replace_words(
    status: str = 'pending',
    limit: int = 50,
    offset: int = 0,
    sort_by: str = 'confidence',
    order: str = 'desc',
    db: Session = Depends(get_db)
):
    """
    獲取待審核的替換詞彙列表
    
    Args:
        status: 狀態篩選 (pending/approved/rejected)
        limit: 每頁數量
        offset: 分頁偏移
        sort_by: 排序欄位 (confidence/occurrence/discovered_at)
        order: 排序方向 (asc/desc)
    """
    try:
        # Base query
        query = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == status
        )
        
        # Sorting
        if sort_by == 'confidence':
            order_col = PendingReplaceWord.confidence_score
        elif sort_by == 'occurrence':
            order_col = PendingReplaceWord.occurrence_count
        else:  # discovered_at
            order_col = PendingReplaceWord.discovered_at
        
        if order == 'asc':
            query = query.order_by(order_col.asc())
        else:
            query = query.order_by(order_col.desc())
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        items = query.limit(limit).offset(offset).all()
        
        # Format response
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
    db: Session = Depends(get_db)
):
    """
    獲取待審核的特殊詞彙列表
    
    Args:
        status: 狀態篩選 (pending/approved/rejected)
        limit: 每頁數量
        offset: 分頁偏移
        sort_by: 排序欄位 (confidence/occurrence/discovered_at)
        order: 排序方向 (asc/desc)
    """
    try:
        # Base query
        query = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == status
        )
        
        # Sorting
        if sort_by == 'confidence':
            order_col = PendingSpecialWord.confidence_score
        elif sort_by == 'occurrence':
            order_col = PendingSpecialWord.occurrence_count
        else:  # discovered_at
            order_col = PendingSpecialWord.discovered_at
        
        if order == 'asc':
            query = query.order_by(order_col.asc())
        else:
            query = query.order_by(order_col.desc())
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        items = query.limit(limit).offset(offset).all()
        
        # Format response
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
    """
    驗證替換詞彙是否有衝突
    """
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
    """
    驗證特殊詞彙是否有衝突
    """
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
    """
    批准替換詞彙並移至正式表
    """
    try:
        # Get pending word
        pending = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        # Validate
        validation = validate_replace_word(
            db, pending.source_word, pending.target_word, word_id
        )
        
        if not validation['valid']:
            return {
                "success": False,
                "message": "驗證失敗，存在衝突",
                "validation": validation
            }
        
        # Update pending word status
        pending.status = 'approved'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        # Insert or update in replace_words table (UPSERT)
        existing = db.query(ReplaceWord).filter(
            ReplaceWord.source_word == pending.source_word
        ).first()
        
        if existing:
            # Update existing
            existing.target_word = pending.target_word
            existing.updated_at = func.now()
        else:
            # Insert new
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
    """
    批准特殊詞彙並移至正式表
    """
    try:
        # Get pending word
        pending = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        # Validate
        validation = validate_special_word(db, pending.word, word_id)
        
        if not validation['valid']:
            return {
                "success": False,
                "message": "驗證失敗，存在衝突",
                "validation": validation
            }
        
        # Update pending word status
        pending.status = 'approved'
        pending.reviewed_at = func.now()
        pending.reviewed_by = reviewed_by
        pending.notes = notes
        
        # Insert in special_words table (ignore if exists)
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
    """
    否決替換詞彙
    """
    try:
        # Get pending word
        pending = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        # Update status
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
    """
    否決特殊詞彙
    """
    try:
        # Get pending word
        pending = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.id == word_id
        ).first()
        
        if not pending:
            raise HTTPException(status_code=404, detail=f"找不到 ID 為 {word_id} 的待審核詞彙")
        
        # Update status
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
    """
    批量批准替換詞彙
    """
    try:
        # Validate all words first
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
            
            # Get and approve
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
            
            # Update pending status
            pending.status = 'approved'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            
            # Insert or update in replace_words
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
    """
    批量否決替換詞彙
    """
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
    """
    獲取統計資訊
    """
    try:
        # Pending counts
        pending_replace = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.status == 'pending'
        ).count()
        
        pending_special = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.status == 'pending'
        ).count()
        
        # Today's approved/rejected counts
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
        
        # Total counts in official tables
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
    """
    批量批准特殊詞彙
    """
    try:
        # Validate all words first
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
            
            # Get and approve
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
            
            # Update pending status
            pending.status = 'approved'
            pending.reviewed_at = func.now()
            pending.reviewed_by = reviewed_by
            pending.notes = notes
            
            # Insert in special_words (ignore if exists)
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
    """
    批量否決特殊詞彙
    """
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
