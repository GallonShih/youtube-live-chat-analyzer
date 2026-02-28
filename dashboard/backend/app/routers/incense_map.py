from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.settings import get_current_video_id

router = APIRouter(prefix="/api/incense-map", tags=["incense-map"])


@router.get("/candidates")
def get_incense_candidates(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
):
    video_id = get_current_video_id(db)

    where = "message ~ '[\\u4e00-\\u9fff]{2,6}代表上香' AND live_stream_id = :video_id"
    params: dict = {"video_id": video_id}

    if start_time:
        where += " AND published_at >= :start_time"
        params["start_time"] = start_time
    if end_time:
        where += " AND published_at <= :end_time"
        params["end_time"] = end_time

    sql = text(f"""
        SELECT
            (regexp_match(message, '([\\u4e00-\\u9fff]{{2,6}})代表上香'))[1] AS word,
            COUNT(*) AS count
        FROM chat_messages
        WHERE {where}
        GROUP BY word
        ORDER BY count DESC
    """)

    rows = db.execute(sql, params).fetchall()
    total = sum(r.count for r in rows)

    candidates = [
        {
            "word": r.word,
            "count": r.count,
            "percentage": round(r.count / total * 100, 2) if total > 0 else 0,
        }
        for r in rows
    ]

    return {
        "total_matched": total,
        "unique_candidates": len(candidates),
        "candidates": candidates,
    }
