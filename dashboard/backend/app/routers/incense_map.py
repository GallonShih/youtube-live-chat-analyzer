from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.database import get_db
from app.core.settings import get_current_video_id

router = APIRouter(prefix="/api/incense-map", tags=["incense-map"])


@router.get("/candidates")
def get_incense_candidates(db: Session = Depends(get_db)):
    video_id = get_current_video_id(db)

    sql = text(r"""
        SELECT
            (regexp_match(message, '([\u4e00-\u9fff]{2,6})代表上香'))[1] AS word,
            COUNT(*) AS count
        FROM chat_messages
        WHERE message ~ '[\u4e00-\u9fff]{2,6}代表上香'
          AND live_stream_id = :video_id
        GROUP BY word
        ORDER BY count DESC
    """)

    rows = db.execute(sql, {"video_id": video_id}).fetchall()
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
