from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from datetime import datetime, timedelta
from typing import Optional, List
import logging

from app.core.database import get_db
from app.core.settings import get_current_video_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/wordcloud", tags=["wordcloud"])


@router.get("/word-frequency")
def get_word_frequency(
    start_time: datetime = None,
    end_time: datetime = None,
    exclude_words: str = Query(default="", description="Comma-separated words to exclude"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """
    計算詞頻統計，用於文字雲繪製
    
    Args:
        start_time: 開始時間
        end_time: 結束時間
        exclude_words: 逗號分隔的排除詞
        limit: 返回詞數上限 (1-500)
    """
    try:
        # 預設排除的標點符號和特殊字元
        default_excluded = {
            '~', ':', ',', '!', '?', '.', ';', '"', "'", '`',
            '(', ')', '[', ']', '{', '}', '<', '>', '/', '\\',
            '-', '_', '+', '=', '*', '&', '^', '%', '$', '#', '@',
            '。', '，', '！', '？', '、', '：', '；', '"', '"', ''', ''',
            '（', '）', '【', '】', '《', '》', '「', '」', '『', '』',
            '...', '..', '~~', '~~~~~', '......'
        }
        
        # 解析用戶指定的排除詞
        user_excluded = set()
        if exclude_words:
            user_excluded = set(w.strip() for w in exclude_words.split(",") if w.strip())
        
        # 合併排除詞
        excluded = default_excluded | user_excluded
        
        # 構建基礎查詢
        # 使用 unnest 展開 tokens array 並計算詞頻
        # Per-Message count: 同一則留言中，同個詞只計算一次，避免刷屏影響
        base_query = """
            SELECT word, COUNT(*) as count
            FROM (
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
        
        base_query += """
            ) AS words
            GROUP BY word
            ORDER BY count DESC
            LIMIT :limit
        """
        params["limit"] = limit + len(excluded)  # 多取一些以補償排除詞
        
        result = db.execute(text(base_query), params)
        rows = result.fetchall()
        
        # 過濾排除詞並限制數量
        words = []
        for row in rows:
            word, count = row
            if word not in excluded:
                words.append({"word": word, "count": count})
                if len(words) >= limit:
                    break
        
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
