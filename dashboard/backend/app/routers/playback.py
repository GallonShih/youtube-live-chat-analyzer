from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple
from collections import defaultdict
import bisect
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import StreamStats, ChatMessage, CurrencyRate, PAID_MESSAGE_TYPES

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/playback", tags=["playback"])


def get_hour_bucket_key(dt: datetime) -> datetime:
    """Get the start of the hour containing this datetime (for bucket key)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.replace(minute=0, second=0, microsecond=0)


def normalize_dt(dt: datetime) -> datetime:
    """Normalize datetime to UTC for consistent comparison."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _find_nearest_viewer(
    viewer_times: List[float],
    viewer_counts: List[Optional[int]],
    target_ts: float,
    max_diff: float = 600.0,
) -> Optional[int]:
    """Find the nearest viewer count using binary search. O(log n)."""
    if not viewer_times:
        return None
    idx = bisect.bisect_left(viewer_times, target_ts)
    best = None
    best_diff = max_diff + 1
    # Check the entry at idx and idx-1 (the two nearest candidates)
    for candidate in (idx - 1, idx):
        if 0 <= candidate < len(viewer_times):
            diff = abs(viewer_times[candidate] - target_ts)
            if diff < best_diff:
                best_diff = diff
                best = candidate
    if best is not None and best_diff <= max_diff:
        return viewer_counts[best]
    return None


@router.get("/snapshots")
def get_playback_snapshots(
    start_time: datetime = Query(..., description="Start time for playback"),
    end_time: datetime = Query(..., description="End time for playback"),
    step_seconds: int = Query(300, description="Time interval between snapshots in seconds"),
    db: Session = Depends(get_db)
):
    """
    Get aggregated snapshots for playback within a time range.

    Each snapshot contains:
    - timestamp: The time point
    - viewer_count: Concurrent viewers at this time (or nearest available)
    - hourly_messages: Message count in the hour containing this timestamp
    - paid_message_count: Cumulative paid message count from start
    - revenue_twd: Cumulative revenue in TWD from start

    Time Complexity: O(n + s*log(v)) where n = messages, s = snapshots, v = viewer stats
    """
    try:
        # Validate parameters
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")

        if step_seconds < 60:
            raise HTTPException(status_code=400, detail="step_seconds must be at least 60")

        if step_seconds > 3600:
            raise HTTPException(status_code=400, detail="step_seconds must be at most 3600")

        # Limit total duration to prevent excessive data
        max_duration = timedelta(days=30)
        if end_time - start_time > max_duration:
            raise HTTPException(status_code=400, detail="Time range cannot exceed 30 days")

        # Ensure timezone awareness (convert naive datetime to UTC)
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        video_id = get_current_video_id(db)

        # Get viewer stats — only needed columns (avoids loading raw_response JSONB)
        viewer_query = db.query(
            StreamStats.collected_at, StreamStats.concurrent_viewers
        ).filter(
            StreamStats.collected_at >= start_time,
            StreamStats.collected_at <= end_time
        ).order_by(StreamStats.collected_at)

        if video_id:
            viewer_query = viewer_query.filter(StreamStats.live_stream_id == video_id)

        viewer_rows = viewer_query.all()
        # Pre-compute sorted timestamp arrays for binary search
        viewer_times = [normalize_dt(r.collected_at).timestamp() for r in viewer_rows]
        viewer_counts = [r.concurrent_viewers for r in viewer_rows]

        # Query A: timestamps only (for hourly counting) — avoids loading raw_data, message, etc.
        ts_query = db.query(ChatMessage.published_at).filter(
            ChatMessage.published_at >= start_time,
            ChatMessage.published_at <= end_time
        )
        if video_id:
            ts_query = ts_query.filter(ChatMessage.live_stream_id == video_id)
        ts_query = ts_query.order_by(ChatMessage.published_at)

        sorted_timestamps = [
            normalize_dt(row.published_at)
            for row in ts_query.all()
            if row.published_at
        ]

        # Query B: paid messages only (~5% of total) — need raw_data for revenue
        paid_query = db.query(
            ChatMessage.published_at, ChatMessage.message_type, ChatMessage.raw_data
        ).filter(
            ChatMessage.published_at >= start_time,
            ChatMessage.published_at <= end_time,
            ChatMessage.message_type.in_(PAID_MESSAGE_TYPES)
        )
        if video_id:
            paid_query = paid_query.filter(ChatMessage.live_stream_id == video_id)
        paid_query = paid_query.order_by(ChatMessage.published_at)

        paid_messages = [
            (normalize_dt(row.published_at), row.message_type, row.raw_data)
            for row in paid_query.all()
            if row.published_at
        ]

        # Get currency rates for revenue calculation
        rates_query = db.query(CurrencyRate).all()
        rate_map = {rate.currency: float(rate.rate_to_twd) if rate.rate_to_twd else 0.0 for rate in rates_query}

        # Helper to calculate revenue for a paid message tuple
        def get_message_revenue(msg_type, raw_data):
            if msg_type not in PAID_MESSAGE_TYPES or not raw_data or 'money' not in raw_data:
                return 0.0
            money_data = raw_data.get('money', {})
            currency = money_data.get('currency')
            amount_str = money_data.get('amount')
            if not currency or not amount_str:
                return 0.0
            try:
                amount_str = str(amount_str).replace(',', '').replace('$', '').strip()
                amount = float(amount_str)
                return amount * rate_map.get(currency, 0.0)
            except (ValueError, TypeError):
                return 0.0

        # ========== O(n) Pre-computation: Build hourly message buckets ==========
        hourly_buckets = defaultdict(int)
        for ts in sorted_timestamps:
            bucket_key = get_hour_bucket_key(ts)
            hourly_buckets[bucket_key] += 1

        # ========== Generate snapshots at each step ==========
        snapshots = []
        current_time = start_time
        step_delta = timedelta(seconds=step_seconds)

        # Track cumulative values from start_time
        cumulative_paid_count = 0
        cumulative_revenue = 0.0
        paid_index = 0  # Track position in paid messages for cumulative
        hour_message_index = 0  # Track position for hourly counting
        last_hour_start = None  # Track when we enter a new hour
        hourly_message_count = 0  # Count messages in current partial hour

        while current_time <= end_time:
            # Find nearest viewer count via binary search O(log v)
            target_ts = normalize_dt(current_time).timestamp()
            viewer_count = _find_nearest_viewer(viewer_times, viewer_counts, target_ts)

            # ========== Calculate hourly_messages ==========
            current_hour_key = get_hour_bucket_key(current_time)
            is_exact_hour = (current_time.minute == 0 and current_time.second == 0 and current_time.microsecond == 0)

            if is_exact_hour and current_time > start_time:
                # Exact hour boundary: Show previous hour's COMPLETE count (O(1) lookup)
                prev_hour_key = current_hour_key - timedelta(hours=1)
                hourly_messages = hourly_buckets.get(prev_hour_key, 0)
            else:
                # Mid-hour: Count messages from hour_start to current_time
                # Reset counter when entering a new hour
                if last_hour_start != current_hour_key:
                    last_hour_start = current_hour_key
                    hourly_message_count = 0
                    # Find starting index for this hour
                    hour_message_index = 0
                    for i, ts in enumerate(sorted_timestamps):
                        if get_hour_bucket_key(ts) >= current_hour_key:
                            hour_message_index = i
                            break

                # Count messages from hour_start to current_time
                current_norm = normalize_dt(current_time)
                while hour_message_index < len(sorted_timestamps):
                    ts = sorted_timestamps[hour_message_index]
                    ts_bucket = get_hour_bucket_key(ts)
                    if ts_bucket != current_hour_key:
                        break
                    if ts < current_norm:
                        hourly_message_count += 1
                        hour_message_index += 1
                    else:
                        break

                hourly_messages = hourly_message_count

            # Update cumulative paid values
            current_norm = normalize_dt(current_time)
            while paid_index < len(paid_messages):
                pub_time, msg_type, raw_data = paid_messages[paid_index]
                if pub_time <= current_norm:
                    revenue = get_message_revenue(msg_type, raw_data)
                    if revenue > 0:
                        cumulative_paid_count += 1
                        cumulative_revenue += revenue
                    paid_index += 1
                else:
                    break

            snapshots.append({
                "timestamp": current_time.isoformat(),
                "viewer_count": viewer_count,
                "hourly_messages": hourly_messages,
                "paid_message_count": cumulative_paid_count,
                "revenue_twd": round(cumulative_revenue, 2)
            })

            current_time += step_delta

        return {
            "snapshots": snapshots,
            "metadata": {
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "step_seconds": step_seconds,
                "total_snapshots": len(snapshots),
                "video_id": video_id
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating playback snapshots: {e}")
        raise HTTPException(status_code=500, detail=str(e))
