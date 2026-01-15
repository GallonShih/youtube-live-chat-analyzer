from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import StreamStats, ChatMessage, CurrencyRate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stats", tags=["stats"])

@router.get("/viewers")
def get_viewer_stats(
    limit: int = 100, 
    hours: int = None, 
    start_time: datetime = None, 
    end_time: datetime = None, 
    db: Session = Depends(get_db)
):
    try:
        query = db.query(StreamStats).order_by(StreamStats.collected_at.desc())
        
        video_id = get_current_video_id(db)
        if video_id:
            query = query.filter(StreamStats.live_stream_id == video_id)
        
        if start_time and end_time:
            query = query.filter(StreamStats.collected_at >= start_time, StreamStats.collected_at <= end_time)
        elif hours:
            since = datetime.now(timezone.utc) - timedelta(hours=hours)
            query = query.filter(StreamStats.collected_at >= since)
        else:
            query = query.limit(limit)
            
        stats = query.all()
        
        result = []
        for s in reversed(stats):
            if s.concurrent_viewers is not None:
                result.append({
                    "time": s.collected_at.isoformat(),
                    "count": s.concurrent_viewers
                })
        return result
    except Exception as e:
        logger.error(f"Error fetching viewer stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/comments")
def get_comment_stats_hourly(
    hours: int = 24, 
    start_time: datetime = None, 
    end_time: datetime = None, 
    db: Session = Depends(get_db)
):
    try:
        if start_time and end_time:
            since = start_time
        else:
            since = datetime.now(timezone.utc) - timedelta(hours=hours)
            start_time = since
            end_time = None
        
        trunc_func = func.date_trunc('hour', ChatMessage.published_at)
        
        query = db.query(
            trunc_func.label('hour'),
            func.count(ChatMessage.message_id).label('count')
        ).filter(
            ChatMessage.published_at >= start_time
        )
        
        video_id = get_current_video_id(db)
        if video_id:
            query = query.filter(ChatMessage.live_stream_id == video_id)
        
        if end_time:
             query = query.filter(ChatMessage.published_at <= end_time)
             
        results = query.group_by(
            trunc_func
        ).order_by(
            trunc_func
        ).all()
        
        data = []
        for r in results:
            dt = r.hour
            data.append({
                "hour": dt.isoformat(), 
                "count": r.count
            })
            
        return data
    except Exception as e:
        logger.error(f"Error fetching comment stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/money-summary")
def get_money_summary(
    start_time: datetime = None,
    end_time: datetime = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(ChatMessage).filter(
            ChatMessage.message_type == 'paid_message'
        )
        
        video_id = get_current_video_id(db)
        if video_id:
            query = query.filter(ChatMessage.live_stream_id == video_id)
        
        if start_time:
            query = query.filter(ChatMessage.published_at >= start_time)
        if end_time:
            query = query.filter(ChatMessage.published_at <= end_time)
        
        messages = query.all()
        
        rates_query = db.query(CurrencyRate).all()
        rate_map = {rate.currency: float(rate.rate_to_twd) if rate.rate_to_twd else 0.0 for rate in rates_query}
        
        total_twd = 0.0
        author_amounts = {}
        unknown_currencies = set()
        paid_count = 0
        
        for msg in messages:
            if not msg.raw_data or 'money' not in msg.raw_data:
                continue
            
            money_data = msg.raw_data.get('money')
            if not money_data:
                continue
            
            currency = money_data.get('currency')
            amount_str = money_data.get('amount')
            
            if not currency or not amount_str:
                continue
            
            try:
                amount_str = str(amount_str).replace(',', '').replace('$', '').strip()
                amount = float(amount_str)
            except (ValueError, TypeError):
                logger.warning(f"Could not parse amount: {amount_str}")
                continue
            
            if currency in rate_map:
                amount_twd = amount * rate_map[currency]
                total_twd += amount_twd
                
                author = msg.author_name or 'Unknown'
                if author not in author_amounts:
                    author_amounts[author] = {'amount_twd': 0.0, 'count': 0}
                
                author_amounts[author]['amount_twd'] += amount_twd
                author_amounts[author]['count'] += 1
                paid_count += 1
            else:
                unknown_currencies.add(currency)
        
        sorted_authors = sorted(
            [
                {
                    'author': author,
                    'amount_twd': round(data['amount_twd'], 2),
                    'message_count': data['count']
                }
                for author, data in author_amounts.items()
            ],
            key=lambda x: x['amount_twd'],
            reverse=True
        )
        
        if len(sorted_authors) > 5:
            fifth_amount = sorted_authors[4]['amount_twd']
            top_authors = [a for a in sorted_authors if a['amount_twd'] >= fifth_amount]
        else:
            top_authors = sorted_authors

        
        return {
            "total_amount_twd": round(total_twd, 2),
            "paid_message_count": paid_count,
            "top_authors": top_authors,
            "unknown_currencies": list(unknown_currencies)
        }
        
    except Exception as e:
        logger.error(f"Error calculating money summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))
