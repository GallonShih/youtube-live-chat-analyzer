from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import StreamStats, ChatMessage, CurrencyRate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/playback", tags=["playback"])


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
    - paid_message_count: Paid message count in the hour
    - revenue_twd: Revenue in TWD for the hour
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
        from datetime import timezone
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
        
        # Helper to normalize datetime for comparison
        # Convert all datetimes to UTC for consistent comparison
        def normalize_dt(dt):
            if dt.tzinfo is None:
                # Assume naive datetimes are UTC
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        
        # Helper to calculate revenue for a message
        def get_message_revenue(msg):
            if msg.message_type != 'paid_message' or not msg.raw_data or 'money' not in msg.raw_data:
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
        
        # Generate snapshots at each step
        snapshots = []
        current_time = start_time
        step_delta = timedelta(seconds=step_seconds)
        
        # Track cumulative values from start_time
        cumulative_paid_count = 0
        cumulative_revenue = 0.0
        message_index = 0  # Track position in sorted messages
        
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
            
            # Calculate hourly_messages: from start of current hour to current_time
            # Special case: if current_time is exactly on the hour boundary (e.g., 03:00:00),
            # show the PREVIOUS hour's data instead (e.g., 02:00-03:00), otherwise it would be 0
            hour_start = current_time.replace(minute=0, second=0, microsecond=0)
            current_norm = normalize_dt(current_time)
            hour_start_norm = normalize_dt(hour_start)
            
            # Check if we're exactly on the hour boundary
            is_exact_hour = (current_time.minute == 0 and current_time.second == 0 and current_time.microsecond == 0)
            
            if is_exact_hour and current_time > start_time:
                # Show previous hour's complete data
                prev_hour_start = hour_start - timedelta(hours=1)
                hour_start_norm = normalize_dt(prev_hour_start)
                # current_norm stays as the hour boundary (end of previous hour)
            
            hourly_messages = 0
            for msg in sorted_messages:
                msg_time = normalize_dt(msg.published_at)
                if msg_time >= hour_start_norm and msg_time < current_norm:
                    hourly_messages += 1
            
            # Update cumulative values: count all messages from start_time to current_time
            start_norm = normalize_dt(start_time)
            while message_index < len(sorted_messages):
                msg = sorted_messages[message_index]
                msg_time = normalize_dt(msg.published_at)
                if msg_time <= current_norm:
                    # This message is within range, add to cumulative
                    if msg.message_type == 'paid_message':
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
