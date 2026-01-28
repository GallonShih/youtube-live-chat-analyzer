from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from collections import defaultdict
import logging
import emoji

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/emojis", tags=["emojis"])


def extract_emojis_from_message(message_text: str) -> list[dict]:
    """Extract Unicode emojis from message text using emoji package.
    
    Returns list of {name, emoji_char} dicts for each unique emoji.
    """
    if not message_text:
        return []
    
    emoji_list = emoji.emoji_list(message_text)
    unique_emojis = {}
    for e in emoji_list:
        emoji_char = e['emoji']
        if emoji_char not in unique_emojis:
            unique_emojis[emoji_char] = {
                'name': emoji_char,
                'emoji_char': emoji_char
            }
    return list(unique_emojis.values())


def extract_youtube_emotes(emotes: list) -> list[dict]:
    """Extract YouTube emotes from emotes JSON array.
    
    Returns list of {name, image_url} dicts for each unique emote.
    """
    if not emotes:
        return []
    
    unique_emotes = {}
    for emote in emotes:
        name = emote.get('name')
        if name and name not in unique_emotes:
            images = emote.get('images', [])
            image_url = images[0].get('url') if images else None
            unique_emotes[name] = {
                'name': name,
                'image_url': image_url
            }
    return list(unique_emotes.values())


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
    
    Aggregates both:
    - YouTube emotes (from emotes JSON field)
    - Standard Unicode emojis (from message text)
    
    Returns unique emojis with message counts.
    """
    try:
        if limit > 500:
            limit = 500
        
        # Build base query
        query = db.query(ChatMessage)
        
        video_id = get_current_video_id(db)
        if video_id:
            query = query.filter(ChatMessage.live_stream_id == video_id)
        
        if start_time:
            query = query.filter(ChatMessage.published_at >= start_time)
        if end_time:
            query = query.filter(ChatMessage.published_at <= end_time)
        
        # If no time filter, default to last 12 hours (matching frontend behavior)
        if not start_time and not end_time:
            twelve_hours_ago = datetime.utcnow() - timedelta(hours=12)
            query = query.filter(ChatMessage.published_at >= twelve_hours_ago)
        
        messages = query.all()
        
        # Aggregate emoji counts
        # Key: (name, is_youtube) -> {name, image_url, is_youtube_emoji, message_ids}
        emoji_data = defaultdict(lambda: {
            'name': '',
            'image_url': None,
            'is_youtube_emoji': False,
            'message_ids': set()
        })
        
        for msg in messages:
            # Process YouTube emotes
            youtube_emotes = extract_youtube_emotes(msg.emotes)
            for emote in youtube_emotes:
                key = (emote['name'], True)
                emoji_data[key]['name'] = emote['name']
                emoji_data[key]['image_url'] = emote['image_url']
                emoji_data[key]['is_youtube_emoji'] = True
                emoji_data[key]['message_ids'].add(msg.message_id)
            
            # Process Unicode emojis from message text
            unicode_emojis = extract_emojis_from_message(msg.message)
            for ue in unicode_emojis:
                key = (ue['name'], False)
                emoji_data[key]['name'] = ue['name']
                emoji_data[key]['image_url'] = None
                emoji_data[key]['is_youtube_emoji'] = False
                emoji_data[key]['message_ids'].add(msg.message_id)
        
        # Convert to list with counts
        emoji_list = []
        for key, data in emoji_data.items():
            emoji_list.append({
                'name': data['name'],
                'image_url': data['image_url'],
                'is_youtube_emoji': data['is_youtube_emoji'],
                'message_count': len(data['message_ids'])
            })
        
        # Apply filter
        if filter:
            filter_lower = filter.lower()
            emoji_list = [e for e in emoji_list if filter_lower in e['name'].lower()]
            
        # Apply type filter
        if type_filter == 'youtube':
            emoji_list = [e for e in emoji_list if e['is_youtube_emoji']]
        elif type_filter == 'unicode':
            emoji_list = [e for e in emoji_list if not e['is_youtube_emoji']]
        
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
        
    except Exception as e:
        logger.error(f"Error fetching emoji stats: {e}")
        raise
