from fastapi import FastAPI, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from database import get_db_session, get_db_manager
from models import StreamStats, ChatMessage
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
