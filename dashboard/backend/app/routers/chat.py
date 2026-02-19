from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, timedelta
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import ChatMessage, PAID_MESSAGE_TYPES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])


def _extract_badges(raw_data):
    """Extract and normalize author badges from raw message payload."""
    if not raw_data or not isinstance(raw_data, dict):
        return []

    author = raw_data.get('author')
    if not isinstance(author, dict):
        return []

    badges = author.get('badges')
    if not isinstance(badges, list):
        return []

    normalized = []
    for badge in badges:
        if not isinstance(badge, dict):
            continue

        icons = badge.get('icons') if isinstance(badge.get('icons'), list) else []
        icon_url = None

        for preferred_id in ('16x16', '32x32', 'source'):
            selected = next(
                (
                    icon for icon in icons
                    if isinstance(icon, dict) and icon.get('id') == preferred_id and icon.get('url')
                ),
                None
            )
            if selected:
                icon_url = selected.get('url')
                break

        if not icon_url:
            fallback = next(
                (icon for icon in icons if isinstance(icon, dict) and icon.get('url')),
                None
            )
            icon_url = fallback.get('url') if fallback else None

        normalized.append({
            "title": badge.get('title'),
            "icon_url": icon_url
        })

    return normalized


def _build_chat_scope_query(
    db: Session,
    start_time: datetime = None,
    end_time: datetime = None,
    author_filter: str = None,
    message_filter: str = None,
    paid_message_filter: str = 'all',
    apply_default_last_12h: bool = False
):
    """Build a base chat query with shared filters."""
    effective_start = start_time
    if apply_default_last_12h and not effective_start and not end_time:
        effective_start = datetime.utcnow() - timedelta(hours=12)

    query = db.query(ChatMessage)
    video_id = get_current_video_id(db)
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
        query = query.filter(ChatMessage.message_type.in_(PAID_MESSAGE_TYPES))
    elif paid_message_filter == 'non_paid_only':
        query = query.filter(ChatMessage.message_type.notin_(PAID_MESSAGE_TYPES))

    return query


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

        query = _build_chat_scope_query(
            db=db,
            start_time=start_time,
            end_time=end_time,
            author_filter=author_filter,
            message_filter=message_filter,
            paid_message_filter=paid_message_filter
        ).order_by(ChatMessage.published_at.desc())

        total = query.count()

        messages = query.limit(limit).offset(offset).all()

        result = {
            "messages": [
                {
                    "id": msg.message_id,
                    "time": msg.published_at.isoformat() if msg.published_at else None,
                    "author": msg.author_name,
                    "author_id": msg.author_id,
                    "message": msg.message,
                    "emotes": msg.emotes if msg.emotes else [],
                    "badges": _extract_badges(msg.raw_data),
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
        # For incremental updates: only query last 2 hours from 'since'
        effective_start = start_time
        if since and not start_time:
            # Query from 1 hour before 'since' to ensure we catch boundary updates
            effective_start = since - timedelta(hours=1)

        # Use SQL aggregation with DATE_TRUNC for O(1) memory usage
        query = _build_chat_scope_query(
            db=db,
            start_time=effective_start,
            end_time=end_time,
            author_filter=author_filter,
            message_filter=message_filter,
            paid_message_filter=paid_message_filter
        ).with_entities(
            func.date_trunc('hour', ChatMessage.published_at).label('hour'),
            func.count().label('count')
        )

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


@router.get("/top-authors")
def get_top_authors(
    start_time: datetime = None,
    end_time: datetime = None,
    author_filter: str = None,
    message_filter: str = None,
    paid_message_filter: str = 'all',
    include_meta: bool = False,
    db: Session = Depends(get_db)
):
    """Get top 5 authors by message count with tie handling.
    
    Returns authors sorted by message count descending. If there are ties
    at the 5th position, all authors with that count are included.
    """
    try:
        query = _build_chat_scope_query(
            db=db,
            start_time=start_time,
            end_time=end_time,
            author_filter=author_filter,
            message_filter=message_filter,
            paid_message_filter=paid_message_filter,
            apply_default_last_12h=True
        )

        # Single subquery: aggregate counts by author_id
        count_subquery = query.with_entities(
            ChatMessage.author_id.label('author_id'),
            func.count().label('count')
        ).group_by(ChatMessage.author_id).subquery()

        # Total distinct authors from count subquery
        total_authors = db.query(func.count()).select_from(count_subquery).scalar()

        # Fetch top 6 to detect ties at 5th position (avoids loading all authors)
        top_rows = db.query(
            count_subquery.c.author_id,
            count_subquery.c.count
        ).order_by(
            count_subquery.c.count.desc(),
            count_subquery.c.author_id.asc()
        ).limit(6).all()

        if not top_rows:
            if include_meta:
                return {
                    "top_authors": [],
                    "total_authors": 0,
                    "displayed_authors": 0,
                    "tie_extended": False
                }
            return []

        # Handle ties at 5th position
        if len(top_rows) > 5 and top_rows[4].count == top_rows[5].count:
            fifth_count = top_rows[4].count
            top_rows = db.query(
                count_subquery.c.author_id,
                count_subquery.c.count
            ).filter(
                count_subquery.c.count >= fifth_count
            ).order_by(
                count_subquery.c.count.desc(),
                count_subquery.c.author_id.asc()
            ).all()
        else:
            top_rows = top_rows[:5]

        # Resolve display names: DISTINCT ON picks latest author_name per author_id
        top_author_ids = [r.author_id for r in top_rows]
        name_rows = query.with_entities(
            ChatMessage.author_id,
            ChatMessage.author_name
        ).filter(
            ChatMessage.author_id.in_(top_author_ids)
        ).distinct(ChatMessage.author_id).order_by(
            ChatMessage.author_id,
            ChatMessage.published_at.desc()
        ).all()
        name_map = {r.author_id: r.author_name for r in name_rows}

        top_authors = [
            {
                "author_id": r.author_id,
                "author": name_map.get(r.author_id) or "Unknown",
                "count": r.count
            }
            for r in top_rows
        ]

        if include_meta:
            return {
                "top_authors": top_authors,
                "total_authors": total_authors,
                "displayed_authors": len(top_authors),
                "tie_extended": len(top_authors) > 5
            }

        return top_authors

    except Exception as e:
        logger.error(f"Error fetching top authors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/authors/{author_id}/summary")
def get_author_summary(
    author_id: str,
    start_time: datetime = None,
    end_time: datetime = None,
    db: Session = Depends(get_db)
):
    """Get author summary by stable author_id."""
    try:
        effective_start = start_time
        if not effective_start and not end_time:
            effective_start = datetime.utcnow() - timedelta(hours=12)
        video_id = get_current_video_id(db)

        author_query = _build_chat_scope_query(
            db=db,
            start_time=start_time,
            end_time=end_time,
            apply_default_last_12h=True
        ).filter(ChatMessage.author_id == author_id)

        summary = author_query.with_entities(
            func.count().label('total_messages'),
            func.min(ChatMessage.published_at).label('first_seen'),
            func.max(ChatMessage.published_at).label('last_seen'),
            func.sum(
                case(
                    (ChatMessage.message_type.in_(PAID_MESSAGE_TYPES), 1),
                    else_=0
                )
            ).label('paid_messages')
        ).first()

        total_messages = summary.total_messages if summary else 0
        if total_messages == 0:
            scope_parts = []
            if video_id:
                scope_parts.append(f"live_stream_id={video_id}")
            else:
                scope_parts.append("live_stream_id=all")

            if start_time or end_time:
                scope_parts.append(
                    f"time_range={start_time.isoformat() if start_time else '-'}~{end_time.isoformat() if end_time else '-'}"
                )
            else:
                scope_parts.append(
                    f"time_range=last_12_hours(since {effective_start.isoformat() if effective_start else '-'})"
                )

            scope_text = ", ".join(scope_parts)
            raise HTTPException(
                status_code=404,
                detail=f"查無作者資料：{author_id}。可能不在目前直播或時間範圍內。查詢範圍：{scope_text}"
            )

        latest = author_query.with_entities(
            ChatMessage.author_name,
            ChatMessage.author_images,
            ChatMessage.raw_data
        ).order_by(
            ChatMessage.published_at.desc(),
            ChatMessage.timestamp.desc()
        ).first()

        aliases = author_query.with_entities(
            ChatMessage.author_name.label('name'),
            func.min(ChatMessage.published_at).label('first_seen'),
            func.max(ChatMessage.published_at).label('last_seen'),
            func.count().label('message_count')
        ).group_by(
            ChatMessage.author_name
        ).order_by(
            func.min(ChatMessage.published_at).asc(),
            ChatMessage.author_name.asc()
        ).all()

        return {
            "author_id": author_id,
            "display_name": latest.author_name if latest else "Unknown",
            "author_images": latest.author_images if latest else [],
            "badges": _extract_badges(latest.raw_data if latest else None),
            "total_messages": total_messages,
            "paid_messages": int(summary.paid_messages or 0),
            "first_seen": summary.first_seen.isoformat() if summary.first_seen else None,
            "last_seen": summary.last_seen.isoformat() if summary.last_seen else None,
            "aliases": [
                {
                    "name": row.name or "Unknown",
                    "first_seen": row.first_seen.isoformat() if row.first_seen else None,
                    "last_seen": row.last_seen.isoformat() if row.last_seen else None,
                    "message_count": row.message_count
                }
                for row in aliases
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching author summary for {author_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/authors/{author_id}/messages")
def get_author_messages(
    author_id: str,
    limit: int = 50,
    offset: int = 0,
    start_time: datetime = None,
    end_time: datetime = None,
    db: Session = Depends(get_db)
):
    """Get paginated messages for one author_id."""
    try:
        if limit > 200:
            limit = 200

        query = _build_chat_scope_query(
            db=db,
            start_time=start_time,
            end_time=end_time,
            apply_default_last_12h=True
        ).filter(ChatMessage.author_id == author_id)

        total = query.count()
        messages = query.order_by(
            ChatMessage.published_at.desc(),
            ChatMessage.timestamp.desc()
        ).limit(limit).offset(offset).all()

        return {
            "author_id": author_id,
            "messages": [
                {
                    "id": msg.message_id,
                    "time": msg.published_at.isoformat() if msg.published_at else None,
                    "author": msg.author_name,
                    "author_id": msg.author_id,
                    "message": msg.message,
                    "emotes": msg.emotes if msg.emotes else [],
                    "badges": _extract_badges(msg.raw_data),
                    "message_type": msg.message_type,
                    "money": msg.raw_data.get('money') if msg.raw_data else None
                }
                for msg in messages
            ],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error fetching author messages for {author_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/authors/{author_id}/trend")
def get_author_message_trend(
    author_id: str,
    start_time: datetime = None,
    end_time: datetime = None,
    db: Session = Depends(get_db)
):
    """Get hourly message trend for one author_id."""
    try:
        query = _build_chat_scope_query(
            db=db,
            start_time=start_time,
            end_time=end_time,
            apply_default_last_12h=True
        ).filter(
            ChatMessage.author_id == author_id
        ).with_entities(
            func.date_trunc('hour', ChatMessage.published_at).label('hour'),
            func.count().label('count')
        )

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
        logger.error(f"Error fetching author trend for {author_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
