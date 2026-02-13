from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import logging
import re

from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/text-mining", tags=["text-mining"])


class TextMiningRequest(BaseModel):
    """Request model for text mining analysis."""
    start_time: datetime = Field(..., description="Start time for filtering messages")
    end_time: datetime = Field(..., description="End time for filtering messages")
    target_word: str = Field(..., min_length=1, description="Target word to analyze")


class WordFrequency(BaseModel):
    """Word frequency item."""
    text: str
    count: int


class ExtensionResult(BaseModel):
    """Extension result for 1-5 characters."""
    results: Dict[str, List[WordFrequency]] = Field(
        default_factory=dict,
        description="Results keyed by extension length (1-5)"
    )


class MessageTypeResult(BaseModel):
    """Results for a message type (original or processed)."""
    forward: Dict[str, List[WordFrequency]] = Field(
        default_factory=dict,
        description="Forward extension results (after target word)"
    )
    backward: Dict[str, List[WordFrequency]] = Field(
        default_factory=dict,
        description="Backward extension results (before target word)"
    )


class TextMiningStats(BaseModel):
    """Statistics for the text mining analysis."""
    total_messages: int
    matched_original: int
    matched_processed: int


class TextMiningResponse(BaseModel):
    """Response model for text mining analysis."""
    original_message: MessageTypeResult
    processed_message: MessageTypeResult
    stats: TextMiningStats


def find_extensions(
    messages: List[str],
    target_word: str,
    top_n: int = 5
) -> Dict[str, Dict[str, List[dict]]]:
    """
    Find word extensions before and after the target word.
    
    Args:
        messages: List of message strings to analyze
        target_word: The word to find extensions for
        top_n: Number of top results to return for each length
        
    Returns:
        Dictionary with 'forward' and 'backward' keys, each containing
        results for extension lengths 1-5
    """
    forward_counts: Dict[int, Dict[str, int]] = {i: {} for i in range(1, 6)}
    backward_counts: Dict[int, Dict[str, int]] = {i: {} for i in range(1, 6)}

    def starts_with_whitespace(text: str) -> bool:
        return bool(text) and text[0].isspace()

    def ends_with_whitespace(text: str) -> bool:
        return bool(text) and text[-1].isspace()
    
    for message in messages:
        # Message-level deduplication:
        # the same extension in the same message counts once.
        message_forward_seen: Dict[int, set[str]] = {i: set() for i in range(1, 6)}
        message_backward_seen: Dict[int, set[str]] = {i: set() for i in range(1, 6)}

        # Find all occurrences of target word
        start = 0
        while True:
            idx = message.find(target_word, start)
            if idx == -1:
                break
            
            # Forward extension (after target word)
            end_idx = idx + len(target_word)
            for length in range(1, 6):
                if end_idx + length <= len(message):
                    ext = message[end_idx:end_idx + length]
                    # For forward extension, skip only when the last char is whitespace.
                    if not ends_with_whitespace(ext):
                        message_forward_seen[length].add(ext)
            
            # Backward extension (before target word)
            for length in range(1, 6):
                if idx - length >= 0:
                    ext = message[idx - length:idx]
                    # For backward extension, skip only when the first char is whitespace.
                    if not starts_with_whitespace(ext):
                        message_backward_seen[length].add(ext)
            
            start = idx + 1

        for length in range(1, 6):
            for ext in message_forward_seen[length]:
                forward_counts[length][ext] = forward_counts[length].get(ext, 0) + 1
            for ext in message_backward_seen[length]:
                backward_counts[length][ext] = backward_counts[length].get(ext, 0) + 1
    
    # Convert to sorted top-N results
    forward_result = {}
    backward_result = {}
    
    for length in range(1, 6):
        # Forward
        sorted_forward = sorted(
            forward_counts[length].items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]
        forward_result[str(length)] = [
            {"text": text, "count": count}
            for text, count in sorted_forward
        ]
        
        # Backward
        sorted_backward = sorted(
            backward_counts[length].items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]
        backward_result[str(length)] = [
            {"text": text, "count": count}
            for text, count in sorted_backward
        ]
    
    return {
        "forward": forward_result,
        "backward": backward_result
    }


@router.post("/analyze", response_model=TextMiningResponse)
def analyze_text_mining(
    request: TextMiningRequest,
    db: Session = Depends(get_db)
):
    """
    Analyze text mining patterns for a target word.
    
    Finds the most frequent character extensions before and after
    the target word in both original and processed messages.
    """
    try:
        # Query messages within time range
        query = """
            SELECT original_message, processed_message
            FROM processed_chat_messages
            WHERE published_at >= :start_time
              AND published_at <= :end_time
        """
        
        result = db.execute(
            text(query),
            {
                "start_time": request.start_time,
                "end_time": request.end_time
            }
        )
        rows = result.fetchall()
        
        total_messages = len(rows)
        
        # Separate original and processed messages
        original_messages = []
        processed_messages = []
        matched_original = 0
        matched_processed = 0
        
        for row in rows:
            original_msg = row[0] or ""
            processed_msg = row[1] or ""
            
            if request.target_word in original_msg:
                original_messages.append(original_msg)
                matched_original += 1
            
            if request.target_word in processed_msg:
                processed_messages.append(processed_msg)
                matched_processed += 1
        
        # Analyze extensions
        original_result = find_extensions(original_messages, request.target_word)
        processed_result = find_extensions(processed_messages, request.target_word)
        
        return TextMiningResponse(
            original_message=MessageTypeResult(
                forward=original_result["forward"],
                backward=original_result["backward"]
            ),
            processed_message=MessageTypeResult(
                forward=processed_result["forward"],
                backward=processed_result["backward"]
            ),
            stats=TextMiningStats(
                total_messages=total_messages,
                matched_original=matched_original,
                matched_processed=matched_processed
            )
        )
        
    except Exception as e:
        logger.error(f"Error in text mining analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))
