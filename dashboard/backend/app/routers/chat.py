from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.get("/messages")
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
        
        video_id = get_current_video_id(db)
        if video_id:
            query = query.filter(ChatMessage.live_stream_id == video_id)
        
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


@router.get("/message-stats")
def get_message_stats(
    start_time: datetime = None,
    end_time: datetime = None,
    since: datetime = None,  # For incremental updates - only fetch recent data
    author_filter: str = None,
    message_filter: str = None,
    paid_message_filter: str = 'all',
    db: Session = Depends(get_db)
):
    """Get hourly message counts with the same filters as the messages endpoint.
    
    When 'since' is provided (for incremental updates), only returns data from
    1 hour before that timestamp to minimize data transfer.
    
    Uses SQL DATE_TRUNC for efficient aggregation - no messages loaded into memory.
    """
    try:
        video_id = get_current_video_id(db)
        
        # For incremental updates: only query last 2 hours from 'since'
        effective_start = start_time
        if since and not start_time:
            # Query from 1 hour before 'since' to ensure we catch boundary updates
            effective_start = since - timedelta(hours=1)
        
        # Use SQL aggregation with DATE_TRUNC for O(1) memory usage
        query = db.query(
            func.date_trunc('hour', ChatMessage.published_at).label('hour'),
            func.count().label('count')
        )
        
        if video_id:
            query = query.filter(ChatMessage.live_stream_id == video_id)
        
        if effective_start:
            query = query.filter(ChatMessage.published_at >= effective_start)
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
        
        # Group by truncated hour and order
        hourly_counts = query.group_by(
            func.date_trunc('hour', ChatMessage.published_at)
        ).order_by(
            func.date_trunc('hour', ChatMessage.published_at)
        ).all()
        
        return [
            {
                "hour": row.hour.isoformat() if row.hour else None,
                "count": row.count
            }
            for row in hourly_counts
        ]
        
    except Exception as e:
        logger.error(f"Error fetching message stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

