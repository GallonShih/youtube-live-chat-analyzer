"""Router for word trend group CRUD operations and trend statistics.

Allows users to save, load, update, and delete named word groups
for trend analysis, and query hourly message counts for those words.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, text
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.core.dependencies import require_admin
from app.models import WordTrendGroup, ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/word-trends", tags=["word-trends"])


class WordGroupCreate(BaseModel):
    """Schema for creating a new word group."""
    name: str = Field(..., min_length=1, max_length=100)
    words: List[str] = Field(..., min_items=1)
    exclude_words: Optional[List[str]] = []
    color: str = Field(default='#5470C6', max_length=20)


class WordGroupUpdate(BaseModel):
    """Schema for updating an existing word group."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    words: Optional[List[str]] = Field(None, min_items=0)
    exclude_words: Optional[List[str]] = None
    color: Optional[str] = Field(None, max_length=20)


class WordGroupResponse(BaseModel):
    """Schema for word group response."""
    id: int
    name: str
    words: List[str]
    exclude_words: List[str]
    color: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class TrendStatsRequest(BaseModel):
    """Schema for trend statistics request."""
    group_ids: List[int] = Field(..., min_items=1)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class HourlyCount(BaseModel):
    """Single hourly data point."""
    hour: str
    count: int


class GroupTrendData(BaseModel):
    """Trend data for a single group."""
    group_id: int
    name: str
    color: str
    data: List[HourlyCount]


class TrendStatsResponse(BaseModel):
    """Schema for trend statistics response."""
    groups: List[GroupTrendData]


# ============ CRUD Endpoints ============

@router.get("/groups", response_model=List[WordGroupResponse])
def list_word_groups(db: Session = Depends(get_db)):
    """List all saved word groups."""
    try:
        groups = db.query(WordTrendGroup).order_by(WordTrendGroup.name).all()
        return [
            WordGroupResponse(
                id=g.id,
                name=g.name,
                words=g.words or [],
                exclude_words=g.exclude_words or [],
                color=g.color or '#5470C6',
                created_at=g.created_at.isoformat() if g.created_at else "",
                updated_at=g.updated_at.isoformat() if g.updated_at else ""
            )
            for g in groups
        ]
    except Exception as e:
        logger.error(f"Error listing word groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/groups/{group_id}", response_model=WordGroupResponse)
def get_word_group(group_id: int, db: Session = Depends(get_db)):
    """Get a specific word group by ID."""
    group = db.query(WordTrendGroup).filter(WordTrendGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Word group not found")
    
    return WordGroupResponse(
        id=group.id,
        name=group.name,
        words=group.words or [],
        exclude_words=group.exclude_words or [],
        color=group.color or '#5470C6',
        created_at=group.created_at.isoformat() if group.created_at else "",
        updated_at=group.updated_at.isoformat() if group.updated_at else ""
    )


@router.post("/groups", response_model=WordGroupResponse, status_code=201, dependencies=[Depends(require_admin)])
def create_word_group(data: WordGroupCreate, db: Session = Depends(get_db)):
    """Create a new word group."""
    try:
        # Check for duplicate name
        existing = db.query(WordTrendGroup).filter(WordTrendGroup.name == data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Word group name already exists")
        
        # Filter empty words
        words = [w.strip() for w in data.words if w.strip()]
        if not words:
            raise HTTPException(status_code=400, detail="At least one non-empty word is required")

        exclude_words = [w.strip() for w in data.exclude_words if w.strip()] if data.exclude_words else []

        group = WordTrendGroup(
            name=data.name.strip(),
            words=words,
            exclude_words=exclude_words or None,
            color=data.color
        )
        db.add(group)
        db.flush()

        return WordGroupResponse(
            id=group.id,
            name=group.name,
            words=group.words or [],
            exclude_words=group.exclude_words or [],
            color=group.color or '#5470C6',
            created_at=group.created_at.isoformat() if group.created_at else "",
            updated_at=group.updated_at.isoformat() if group.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Word group name already exists")
    except Exception as e:
        logger.error(f"Error creating word group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/groups/{group_id}", response_model=WordGroupResponse, dependencies=[Depends(require_admin)])
def update_word_group(group_id: int, data: WordGroupUpdate, db: Session = Depends(get_db)):
    """Update an existing word group."""
    try:
        group = db.query(WordTrendGroup).filter(WordTrendGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Word group not found")
        
        # Check for duplicate name if name is being changed
        if data.name is not None and data.name.strip() != group.name:
            existing = db.query(WordTrendGroup).filter(
                WordTrendGroup.name == data.name.strip(),
                WordTrendGroup.id != group_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Word group name already exists")
            group.name = data.name.strip()
        
        if data.words is not None:
            words = [w.strip() for w in data.words if w.strip()]
            if not words:
                raise HTTPException(status_code=400, detail="At least one non-empty word is required")
            group.words = words
        
        if data.color is not None:
            group.color = data.color

        if data.exclude_words is not None:
            exclude_words = [w.strip() for w in data.exclude_words if w.strip()]
            group.exclude_words = exclude_words or None

        db.flush()

        return WordGroupResponse(
            id=group.id,
            name=group.name,
            words=group.words or [],
            exclude_words=group.exclude_words or [],
            color=group.color or '#5470C6',
            created_at=group.created_at.isoformat() if group.created_at else "",
            updated_at=group.updated_at.isoformat() if group.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Word group name already exists")
    except Exception as e:
        logger.error(f"Error updating word group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/groups/{group_id}", dependencies=[Depends(require_admin)])
def delete_word_group(group_id: int, db: Session = Depends(get_db)):
    """Delete a word group."""
    try:
        group = db.query(WordTrendGroup).filter(WordTrendGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Word group not found")
        
        db.delete(group)
        db.flush()
        
        return {"message": "Word group deleted successfully", "id": group_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting word group: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Trend Statistics Endpoint ============

@router.post("/stats", response_model=TrendStatsResponse)
def get_trend_stats(data: TrendStatsRequest, db: Session = Depends(get_db)):
    """
    Query hourly message counts for multiple word groups.
    
    For each group, counts messages containing ANY of the group's words (case-insensitive).
    Each message is counted once per group, even if it contains multiple matching words.
    """
    try:
        # Get the requested groups
        groups = db.query(WordTrendGroup).filter(WordTrendGroup.id.in_(data.group_ids)).all()
        if not groups:
            raise HTTPException(status_code=404, detail="No word groups found")
        
        # Set time range
        if data.start_time and data.end_time:
            start_time = data.start_time
            end_time = data.end_time
        else:
            # Default to last 24 hours
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=24)
        
        # Get current video ID for filtering
        video_id = get_current_video_id(db)
        
        result_groups = []
        
        for group in groups:
            words = group.words or []
            if not words:
                result_groups.append(GroupTrendData(
                    group_id=group.id,
                    name=group.name,
                    color=group.color or '#5470C6',
                    data=[]
                ))
                continue
            
            # Build the query with OR conditions for each word
            # Using ILIKE for case-insensitive contains match
            trunc_func = func.date_trunc('hour', ChatMessage.published_at)
            
            # Create OR conditions for word matching
            from sqlalchemy import or_
            word_conditions = [ChatMessage.message.ilike(f'%{word}%') for word in words]
            
            query = db.query(
                trunc_func.label('hour'),
                func.count(func.distinct(ChatMessage.message_id)).label('count')
            ).filter(
                ChatMessage.published_at >= start_time,
                ChatMessage.published_at <= end_time,
                or_(*word_conditions)
            )
            
            if video_id:
                query = query.filter(ChatMessage.live_stream_id == video_id)
            
            results = query.group_by(trunc_func).order_by(trunc_func).all()
            
            hourly_data = [
                HourlyCount(hour=r.hour.isoformat(), count=r.count)
                for r in results
            ]
            
            result_groups.append(GroupTrendData(
                group_id=group.id,
                name=group.name,
                color=group.color or '#5470C6',
                data=hourly_data
            ))
        
        return TrendStatsResponse(groups=result_groups)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trend stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
