from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict
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
    
    Time Complexity: O(n + s) where n = messages, s = snapshots
    (Previously O(n × s) due to inner loop)
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
        
        # Get all viewer stats in range
        viewer_query = db.query(StreamStats).filter(
            StreamStats.collected_at >= start_time,
            StreamStats.collected_at <= end_time
        ).order_by(StreamStats.collected_at)
        
        if video_id:
            viewer_query = viewer_query.filter(StreamStats.live_stream_id == video_id)
        
        viewer_stats = viewer_query.all()
        
        # Get all chat messages in range
        message_query = db.query(ChatMessage).filter(
            ChatMessage.published_at >= start_time,
            ChatMessage.published_at <= end_time
        )
        
        if video_id:
            message_query = message_query.filter(ChatMessage.live_stream_id == video_id)
        
        all_messages = message_query.all()
        
        # Get currency rates for revenue calculation
        rates_query = db.query(CurrencyRate).all()
        rate_map = {rate.currency: float(rate.rate_to_twd) if rate.rate_to_twd else 0.0 for rate in rates_query}
        
        # Sort messages by timestamp for progressive calculation
        sorted_messages = sorted(
            [m for m in all_messages if m.published_at],
            key=lambda m: m.published_at
        )
        
        # Helper to calculate revenue for a message
        def get_message_revenue(msg):
            if msg.message_type not in PAID_MESSAGE_TYPES or not msg.raw_data or 'money' not in msg.raw_data:
                return 0.0
            money_data = msg.raw_data.get('money', {})
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
        # This is for exact hour boundaries (e.g., 09:00:00)
        hourly_buckets = defaultdict(int)
        for msg in sorted_messages:
            bucket_key = get_hour_bucket_key(msg.published_at)
            hourly_buckets[bucket_key] += 1
        
        # ========== Generate snapshots at each step ==========
        snapshots = []
        current_time = start_time
        step_delta = timedelta(seconds=step_seconds)
        
        # Track cumulative values from start_time
        cumulative_paid_count = 0
        cumulative_revenue = 0.0
        message_index = 0  # Track position in sorted messages for cumulative
        hour_message_index = 0  # Track position for hourly counting
        last_hour_start = None  # Track when we enter a new hour
        hourly_message_count = 0  # Count messages in current partial hour
        
        while current_time <= end_time:
            # Find nearest viewer count
            viewer_count = None
            if viewer_stats:
                def get_time_diff(stat):
                    stat_time = normalize_dt(stat.collected_at)
                    loop_time = normalize_dt(current_time)
                    return abs((stat_time - loop_time).total_seconds())
                
                closest_stat = min(viewer_stats, key=get_time_diff)
                if get_time_diff(closest_stat) <= 600:
                    viewer_count = closest_stat.concurrent_viewers
            
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
                    for i, msg in enumerate(sorted_messages):
                        if get_hour_bucket_key(msg.published_at) >= current_hour_key:
                            hour_message_index = i
                            break
                
                # Count messages from hour_start to current_time
                current_norm = normalize_dt(current_time)
                while hour_message_index < len(sorted_messages):
                    msg = sorted_messages[hour_message_index]
                    msg_bucket = get_hour_bucket_key(msg.published_at)
                    if msg_bucket != current_hour_key:
                        break
                    msg_time = normalize_dt(msg.published_at)
                    if msg_time < current_norm:
                        hourly_message_count += 1
                        hour_message_index += 1
                    else:
                        break
                
                hourly_messages = hourly_message_count
            
            # Update cumulative values: count all messages from start_time to current_time
            current_norm = normalize_dt(current_time)
            while message_index < len(sorted_messages):
                msg = sorted_messages[message_index]
                msg_time = normalize_dt(msg.published_at)
                if msg_time <= current_norm:
                    # This message is within range, add to cumulative
                    if msg.message_type in PAID_MESSAGE_TYPES:
                        revenue = get_message_revenue(msg)
                        if revenue > 0:
                            cumulative_paid_count += 1
                            cumulative_revenue += revenue
                    message_index += 1
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
