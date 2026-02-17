"""Router for playback word cloud API.

Provides word frequency snapshots for dynamic word cloud visualization
in playback mode.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict
from collections import Counter, defaultdict
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

        # Generate all snapshots via single-query sliding window
        snapshots = _compute_all_snapshots(
            db=db,
            start_time=start_time,
            end_time=end_time,
            step_seconds=step_seconds,
            window_hours=window_hours,
            video_id=video_id,
            excluded=excluded,
            replace_dict=replace_dict,
            word_limit=word_limit,
        )

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


def _compute_all_snapshots(
    db: Session,
    start_time: datetime,
    end_time: datetime,
    step_seconds: int,
    window_hours: int,
    video_id: Optional[str],
    excluded: set,
    replace_dict: Dict[str, str],
    word_limit: int,
) -> List[dict]:
    """
    Compute all word-frequency snapshots using a single SQL query
    and a sliding-window algorithm over time buckets.

    Complexity: O(N_total + S * k) where N_total = total rows,
    S = number of snapshots, k = word_limit.
    """
    window_seconds = window_hours * 3600
    query_start = start_time - timedelta(seconds=window_seconds)

    # Step 1: Single SQL query for the entire range
    query = """
        SELECT DISTINCT message_id, published_at, unnest(tokens) AS word
        FROM processed_chat_messages
        WHERE published_at >= :query_start
          AND published_at < :end_time
    """
    params: dict = {"query_start": query_start, "end_time": end_time}
    if video_id:
        query += " AND live_stream_id = :video_id"
        params["video_id"] = video_id
    query += " ORDER BY published_at"

    result = db.execute(text(query), params)
    rows = result.fetchall()

    # Step 2: Pre-process rows — replace, filter, dedupe, bucket
    # Bucket index 0 corresponds to query_start.
    bucket_counters: Dict[int, Counter] = defaultdict(Counter)
    seen_pairs: set = set()

    for message_id, published_at, word in rows:
        replaced_word = replace_dict.get(word, word) if replace_dict else word
        if replaced_word in excluded:
            continue
        pair = (message_id, replaced_word)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        pub = normalize_dt(published_at)
        bucket_idx = int((pub - query_start).total_seconds()) // step_seconds
        bucket_counters[bucket_idx][replaced_word] += 1

    # Step 3: Sliding window over buckets
    window_buckets = window_seconds // step_seconds
    # Generate snapshot timestamps
    step_delta = timedelta(seconds=step_seconds)
    snapshot_times: List[datetime] = []
    t = start_time
    while t <= end_time:
        snapshot_times.append(t)
        t += step_delta

    if not snapshot_times:
        return []

    # Snapshot i at time T = start_time + i*step covers window [T-window, T).
    # In bucket space: T-window = query_start + i*step → bucket i
    #                  T = query_start + window + i*step → bucket window_buckets + i
    # So snapshot i covers buckets [i, window_buckets + i) (exclusive upper).

    # Initialize running counter for first snapshot: buckets [0, window_buckets)
    running = Counter()
    for b in range(0, window_buckets):
        if b in bucket_counters:
            running += bucket_counters[b]

    snapshots: List[dict] = []
    for i, snap_time in enumerate(snapshot_times):
        # Extract top words
        top_words = running.most_common(word_limit)
        snapshots.append({
            "timestamp": snap_time.isoformat(),
            "words": [{"word": w, "size": c} for w, c in top_words],
        })

        # Slide window for next snapshot: [i+1, window_buckets+i+1)
        if i + 1 < len(snapshot_times):
            # Add entering bucket (was just past the old window's end)
            entering = window_buckets + i
            if entering in bucket_counters:
                running += bucket_counters[entering]
            # Subtract leaving bucket (was the old window's start)
            leaving = i
            if leaving in bucket_counters:
                running -= bucket_counters[leaving]

    return snapshots

