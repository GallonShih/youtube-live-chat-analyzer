from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple
from collections import defaultdict
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id
from app.models import ReplacementWordlist

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wordcloud", tags=["wordcloud"])

# 預設排除的標點符號和特殊字元
DEFAULT_EXCLUDED = {
    '~', ':', ',', '!', '?', '.', ';', '"', "'", '`',
    '(', ')', '[', ']', '{', '}', '<', '>', '/', '\\',
    '-', '_', '+', '=', '*', '&', '^', '%', '$', '#', '@',
    '。', '，', '！', '？', '、', '：', '；', '"', '"', ''', ''',
    '（', '）', '【', '】', '《', '》', '「', '」', '『', '』',
    '...', '..', '~~', '~~~~~', '......'
}


def build_replace_dict(replacements: List[Dict]) -> Dict[str, str]:
    """
    Build replacement dictionary, sorted by source length (longest first).
    This ensures longer matches are replaced before shorter ones.
    """
    if not replacements:
        return {}
    
    # Sort by source length descending
    sorted_replacements = sorted(replacements, key=lambda r: len(r.get("source", "")), reverse=True)
    return {r["source"].lower(): r["target"] for r in sorted_replacements if r.get("source")}


def apply_replacement(word: str, replace_dict: Dict[str, str]) -> str:
    """Apply replacement to a single word."""
    return replace_dict.get(word, word)


def count_words_with_replacement(
    rows: List[Tuple[str, str]],
    replace_dict: Dict[str, str],
    excluded: set,
    limit: int
) -> List[Dict]:
    """
    Count word frequencies with post-replacement per-message deduplication.
    
    Args:
        rows: List of (message_id, word) tuples
        replace_dict: Replacement dictionary
        excluded: Set of words to exclude
        limit: Maximum number of words to return
    
    Returns:
        List of {word, count} dictionaries
    """
    # Track unique (message_id, replaced_word) pairs
    seen_pairs = set()
    word_counts = defaultdict(int)
    
    for message_id, word in rows:
        # Apply replacement
        replaced_word = apply_replacement(word, replace_dict) if replace_dict else word
        
        # Skip excluded words
        if replaced_word in excluded:
            continue
        
        # Per-message deduplication: only count once per message
        pair = (message_id, replaced_word)
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            word_counts[replaced_word] += 1
    
    # Sort by count descending and limit
    sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    return [{"word": word, "count": count} for word, count in sorted_words]


@router.get("/word-frequency")
def get_word_frequency(
    start_time: datetime = None,
    end_time: datetime = None,
    exclude_words: str = Query(default="", description="Comma-separated words to exclude"),
    replacement_wordlist_id: Optional[int] = Query(default=None, description="Replacement wordlist ID to use"),
    replacements: Optional[str] = Query(default=None, description="JSON string of ad-hoc replacements"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    計算詞頻統計，用於文字雲繪製
    
    Args:
        start_time: 開始時間
        end_time: 結束時間
        exclude_words: 逗號分隔的排除詞
        replacement_wordlist_id: 後取代字詞列表 ID
        replacements: 自定義取代規則 (JSON 字串，優先順序高於 ID)
        limit: 返回詞數上限 (1-500)
    """
    try:
        import json
        
        # 解析用戶指定的排除詞
        user_excluded = set()
        if exclude_words:
            user_excluded = set(w.strip().lower() for w in exclude_words.split(",") if w.strip())
        
        # 合併排除詞
        excluded = DEFAULT_EXCLUDED | user_excluded
        
        # 載入取代規則
        replace_dict = {}
        
        # 優先使用 Ad-hoc replacements
        if replacements:
            try:
                ad_hoc_list = json.loads(replacements)
                if isinstance(ad_hoc_list, list):
                    replace_dict = build_replace_dict(ad_hoc_list)
            except json.JSONDecodeError:
                logger.warning("Invalid JSON in replacements param")
        
        # 若無 Ad-hoc 且有 ID，則載入 DB 規則
        if not replace_dict and replacement_wordlist_id:
            wordlist = db.query(ReplacementWordlist).filter(
                ReplacementWordlist.id == replacement_wordlist_id
            ).first()
            if wordlist and wordlist.replacements:
                replace_dict = build_replace_dict(wordlist.replacements)
        
        # 構建基礎查詢 - 取得 (message_id, word) pairs
        # Per-Message count: 同一則留言中，同個詞只計算一次
        base_query = """
            SELECT DISTINCT message_id, unnest(tokens) as word
            FROM processed_chat_messages
            WHERE 1=1
        """
        
        params = {}
        
        # 添加時間篩選
        if start_time:
            base_query += " AND published_at >= :start_time"
            params["start_time"] = start_time
        
        if end_time:
            base_query += " AND published_at <= :end_time"
            params["end_time"] = end_time
        
        # 添加 video_id 篩選
        video_id = get_current_video_id(db)
        if video_id:
            base_query += " AND live_stream_id = :video_id"
            params["video_id"] = video_id
        
        result = db.execute(text(base_query), params)
        rows = result.fetchall()
        
        # 套用取代並計算詞頻（含 per-message 去重）
        words = count_words_with_replacement(rows, replace_dict, excluded, limit)
        
        # 取得統計資訊
        stats_query = """
            SELECT 
                COUNT(DISTINCT message_id) as total_messages,
                COUNT(DISTINCT unnest_word) as unique_words
            FROM (
                SELECT message_id, unnest(tokens) as unnest_word
                FROM processed_chat_messages
                WHERE 1=1
        """
        
        stats_params = {}
        if start_time:
            stats_query += " AND published_at >= :start_time"
            stats_params["start_time"] = start_time
        if end_time:
            stats_query += " AND published_at <= :end_time"
            stats_params["end_time"] = end_time
        if video_id:
            stats_query += " AND live_stream_id = :video_id"
            stats_params["video_id"] = video_id
        
        stats_query += ") AS stats"
        
        stats_result = db.execute(text(stats_query), stats_params)
        stats_row = stats_result.fetchone()
        
        total_messages = stats_row[0] if stats_row else 0
        unique_words = stats_row[1] if stats_row else 0
        
        return {
            "words": words,
            "total_messages": total_messages,
            "unique_words": unique_words,
            "excluded_words": list(excluded)
        }
        
    except Exception as e:
        logger.error(f"Error fetching word frequency: {e}")
        raise HTTPException(status_code=500, detail=str(e))

