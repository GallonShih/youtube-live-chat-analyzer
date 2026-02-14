from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/emojis", tags=["emojis"])


@router.get("/stats")
def get_emoji_stats(
    start_time: datetime = None,
    end_time: datetime = None,
    limit: int = 20,
    offset: int = 0,
    filter: str = None,
    type_filter: str = 'all',  # 'all', 'youtube', 'unicode'
    db: Session = Depends(get_db)
):
    """Get emoji statistics for messages within the time range.

    Uses the processed_chat_messages table (pre-extracted by ETL) with
    SQL aggregation to avoid loading all messages into memory.
    """
    if limit > 500:
        limit = 500

    video_id = get_current_video_id(db)

    # Build WHERE conditions
    conditions = []
    params = {}

    if video_id:
        conditions.append("p.live_stream_id = :video_id")
        params["video_id"] = video_id

    if start_time:
        conditions.append("p.published_at >= :start_time")
        params["start_time"] = start_time
    if end_time:
        conditions.append("p.published_at <= :end_time")
        params["end_time"] = end_time

    if not start_time and not end_time:
        conditions.append("p.published_at >= :default_start")
        params["default_start"] = datetime.utcnow() - timedelta(hours=12)

    where_clause = (" AND " + " AND ".join(conditions)) if conditions else ""

    emoji_list = []

    # Query Unicode emojis via unnest on TEXT[] column
    if type_filter in ('all', 'unicode'):
        unicode_sql = text(f"""
            SELECT e.emoji_char AS name,
                   COUNT(DISTINCT p.message_id) AS message_count
            FROM processed_chat_messages p,
                 unnest(p.unicode_emojis) AS e(emoji_char)
            WHERE TRUE {where_clause}
            GROUP BY e.emoji_char
        """)
        rows = db.execute(unicode_sql, params).fetchall()
        for row in rows:
            emoji_list.append({
                'name': row.name,
                'image_url': None,
                'is_youtube_emoji': False,
                'message_count': row.message_count,
            })

    # Query YouTube emotes via jsonb_array_elements on JSONB column
    if type_filter in ('all', 'youtube'):
        yt_sql = text(f"""
            SELECT emote->>'name' AS name,
                   MAX(emote->>'url') AS image_url,
                   COUNT(DISTINCT p.message_id) AS message_count
            FROM processed_chat_messages p,
                 jsonb_array_elements(p.youtube_emotes) AS emote
            WHERE p.youtube_emotes IS NOT NULL
              AND jsonb_array_length(p.youtube_emotes) > 0
              {where_clause}
            GROUP BY emote->>'name'
        """)
        rows = db.execute(yt_sql, params).fetchall()
        for row in rows:
            emoji_list.append({
                'name': row.name,
                'image_url': row.image_url,
                'is_youtube_emoji': True,
                'message_count': row.message_count,
            })

    # Apply name filter
    if filter:
        filter_lower = filter.lower()
        emoji_list = [e for e in emoji_list if filter_lower in e['name'].lower()]

    # Sort by message_count descending
    emoji_list.sort(key=lambda x: x['message_count'], reverse=True)

    total = len(emoji_list)

    # Apply pagination
    paginated_list = emoji_list[offset:offset + limit]

    return {
        "emojis": paginated_list,
        "total": total,
        "limit": limit,
        "offset": offset
    }
