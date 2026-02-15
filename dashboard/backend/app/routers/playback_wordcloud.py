"""Router for playback word cloud API.

Provides word frequency snapshots for dynamic word cloud visualization
in playback mode.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Tuple
from collections import defaultdict
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import ExclusionWordlist, ReplacementWordlist

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/playback", tags=["playback-wordcloud"])

# Valid window hours options
VALID_WINDOW_HOURS = [1, 4, 8, 12, 24]

# Default excluded punctuation and special characters
DEFAULT_EXCLUDED = {
    '~', ':', ',', '!', '?', '.', ';', '"', "'", '`',
    '(', ')', '[', ']', '{', '}', '<', '>', '/', '\\',
    '-', '_', '+', '=', '*', '&', '^', '%', '$', '#', '@',
    '。', '，', '！', '？', '、', '：', '；', '"', '"', ''', ''',
    '（', '）', '【', '】', '《', '》', '「', '」', '『', '』',
    '...', '..', '~~', '~~~~~', '......'
}


def normalize_dt(dt: datetime) -> datetime:
    """Normalize datetime to UTC for consistent comparison."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def build_replace_dict(replacements: List[Dict]) -> Dict[str, str]:
    """
    Build replacement dictionary, sorted by source length (longest first).
    """
    if not replacements:
        return {}
    
    sorted_replacements = sorted(replacements, key=lambda r: len(r.get("source", "")), reverse=True)
    return {r["source"].lower(): r["target"] for r in sorted_replacements if r.get("source")}


@router.get("/word-frequency-snapshots")
def get_word_frequency_snapshots(
    start_time: datetime = Query(..., description="Start time for playback"),
    end_time: datetime = Query(..., description="End time for playback"),
    step_seconds: int = Query(300, description="Time interval between snapshots in seconds"),
    window_hours: int = Query(4, description="Time window in hours for word frequency calculation"),
    word_limit: int = Query(30, ge=10, le=100, description="Max words per snapshot"),
    exclude_words: str = Query(default="", description="Comma-separated words to exclude"),
    wordlist_id: Optional[int] = Query(default=None, description="Exclusion wordlist ID to use"),
    replacement_wordlist_id: Optional[int] = Query(default=None, description="Replacement wordlist ID to use"),
    db: Session = Depends(get_db)
):
    """
    Get word frequency snapshots for dynamic word cloud playback.
    
    Each snapshot contains top N words by frequency within the time window
    ending at that snapshot's timestamp.
    
    Args:
        start_time: Playback start time
        end_time: Playback end time
        step_seconds: Interval between snapshots (60-3600)
        window_hours: Time window for calculating word frequency (1/4/8/12/24)
        word_limit: Max words per snapshot (10-100)
        exclude_words: Comma-separated exclusion words
        wordlist_id: ID of saved exclusion wordlist to use
        replacement_wordlist_id: ID of replacement wordlist to use
    
    Returns:
        Dictionary with snapshots array and metadata
    """
    try:
        # Validate parameters
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")
        
        if step_seconds < 60:
            raise HTTPException(status_code=400, detail="step_seconds must be at least 60")
        
        if step_seconds > 3600:
            raise HTTPException(status_code=400, detail="step_seconds must be at most 3600")
        
        if window_hours not in VALID_WINDOW_HOURS:
            raise HTTPException(
                status_code=400, 
                detail=f"window_hours must be one of {VALID_WINDOW_HOURS}"
            )
        
        # Limit total duration to prevent excessive data
        max_duration = timedelta(days=30)
        if end_time - start_time > max_duration:
            raise HTTPException(status_code=400, detail="Time range cannot exceed 30 days")
        
        # Ensure timezone awareness
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        
        # Build exclusion set
        excluded = set(DEFAULT_EXCLUDED)
        
        # Add user-specified exclusion words
        if exclude_words:
            user_excluded = set(w.strip().lower() for w in exclude_words.split(",") if w.strip())
            excluded |= user_excluded
        
        # Add words from saved wordlist if specified
        if wordlist_id:
            wordlist = db.query(ExclusionWordlist).filter(
                ExclusionWordlist.id == wordlist_id
            ).first()
            if wordlist and wordlist.words:
                excluded |= set(w.lower() for w in wordlist.words)
        
        # Load replacement rules if specified
        replace_dict = {}
        if replacement_wordlist_id:
            replacement_wordlist = db.query(ReplacementWordlist).filter(
                ReplacementWordlist.id == replacement_wordlist_id
            ).first()
            if replacement_wordlist and replacement_wordlist.replacements:
                replace_dict = build_replace_dict(replacement_wordlist.replacements)
        
        video_id = get_current_video_id(db)
        window_delta = timedelta(hours=window_hours)
        
        # Generate snapshots
        snapshots = []
        current_time = start_time
        step_delta = timedelta(seconds=step_seconds)
        
        while current_time <= end_time:
            # Calculate window bounds for this snapshot
            window_end = current_time
            window_start = current_time - window_delta
            
            # Query word frequency for this window
            words = _get_word_frequency_for_window(
                db=db,
                window_start=window_start,
                window_end=window_end,
                video_id=video_id,
                excluded=excluded,
                replace_dict=replace_dict,
                limit=word_limit
            )
            
            snapshots.append({
                "timestamp": current_time.isoformat(),
                "words": words
            })
            
            current_time += step_delta
        
        return {
            "snapshots": snapshots,
            "metadata": {
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "step_seconds": step_seconds,
                "window_hours": window_hours,
                "total_snapshots": len(snapshots),
                "word_limit": word_limit,
                "video_id": video_id
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating word frequency snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _get_word_frequency_for_window(
    db: Session,
    window_start: datetime,
    window_end: datetime,
    video_id: Optional[str],
    excluded: set,
    replace_dict: Dict[str, str],
    limit: int
) -> List[dict]:
    """
    Get word frequency for a specific time window with post-replacement per-message deduplication.
    
    Returns list of {word, size} dictionaries.
    """
    # Build query to get (message_id, word) pairs
    query = """
        SELECT DISTINCT message_id, unnest(tokens) as word
        FROM processed_chat_messages
        WHERE published_at >= :window_start
          AND published_at < :window_end
    """
    
    params = {
        "window_start": window_start,
        "window_end": window_end
    }
    
    if video_id:
        query += " AND live_stream_id = :video_id"
        params["video_id"] = video_id
    
    result = db.execute(text(query), params)
    rows = result.fetchall()
    
    # Apply replacement and dedupe per message
    seen_pairs = set()
    word_counts = defaultdict(int)
    
    for message_id, word in rows:
        # Apply replacement
        replaced_word = replace_dict.get(word, word) if replace_dict else word
        
        # Skip excluded words
        if replaced_word in excluded:
            continue
        
        # Per-message deduplication
        pair = (message_id, replaced_word)
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            word_counts[replaced_word] += 1
    
    # Sort by count descending and limit
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    return [{"word": word, "size": count} for word, count in sorted_words]

