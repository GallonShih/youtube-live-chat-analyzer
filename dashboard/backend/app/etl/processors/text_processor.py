"""
Text Processor Module
文字處理邏輯模組，用於處理聊天留言

功能：
- 套用替換詞彙
- 提取 Unicode emoji
- 提取 YouTube 自定義表情
- 移除 emoji
- 使用 jieba 斷詞
"""

import re
import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any, Set

import emoji
import jieba

logger = logging.getLogger(__name__)

# Stopwords 檔案路徑
# 優先使用環境變數，否則使用相對路徑
STOPWORDS_PATH = Path(os.getenv(
    'STOPWORDS_FILE',
    '/app/text_analysis/cn_stopwords.txt'
))

# 快取 stopwords，避免每次都重新讀取
_stopwords_cache: Optional[Set[str]] = None


def load_stopwords(stopwords_path: Optional[Path] = None) -> Set[str]:
    """
    載入停用詞表

    Args:
        stopwords_path: 停用詞檔案路徑，預設使用 STOPWORDS_PATH

    Returns:
        停用詞集合
    """
    global _stopwords_cache

    if _stopwords_cache is not None:
        return _stopwords_cache

    path = stopwords_path or STOPWORDS_PATH

    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            _stopwords_cache = set(line.rstrip().lower() for line in f if line.rstrip())
        logger.info(f"Loaded {len(_stopwords_cache)} stopwords from {path}")
    else:
        logger.warning(f"Stopwords file not found at {path}")
        _stopwords_cache = set()

    return _stopwords_cache


def clear_stopwords_cache():
    """清除停用詞快取"""
    global _stopwords_cache
    _stopwords_cache = None


def fullwidth_to_halfwidth(text: str) -> str:
    """
    將全形字元轉換為半形字元

    包含：
    - 全形英數字 → 半形英數字
    - 全形空格 → 半形空格
    - 全形標點符號 → 半形標點符號

    Args:
        text: 原始文字

    Returns:
        轉換後的文字
    """
    result = []
    for char in text:
        code = ord(char)
        # 全形空格 (U+3000) → 半形空格
        if code == 0x3000:
            result.append(' ')
        # 全形字元範圍 (U+FF01 ~ U+FF5E) → 半形 (U+0021 ~ U+007E)
        elif 0xFF01 <= code <= 0xFF5E:
            result.append(chr(code - 0xFEE0))
        else:
            result.append(char)
    return ''.join(result)


def normalize_text(text: str) -> str:
    """
    正規化文字

    包含：
    - 全形轉半形
    - 多個空白字元壓縮為單一空格
    - 移除前後空白
    - 處理空字串

    Args:
        text: 原始文字

    Returns:
        正規化後的文字
    """
    if not text:
        return ""

    # 1. 全形轉半形
    text = fullwidth_to_halfwidth(text)

    # 2. 多個空白字元壓縮為單一空格
    text = re.sub(r'\s+', ' ', text)

    # 3. 移除前後空白
    text = text.strip()

    return text


def apply_replace_words(text: str, replace_dict: Dict[str, str]) -> str:
    """
    套用替換詞彙

    Args:
        text: 原始文字
        replace_dict: 替換詞彙字典 {source: target}

    Returns:
        替換後的文字
    """
    result = text.lower()
    # 按照 source 長度降序排列，優先替換較長的詞
    sorted_sources = sorted(replace_dict.keys(), key=len, reverse=True)
    for source in sorted_sources:
        target = replace_dict[source]
        result = result.replace(source, target)
    return result


def extract_unicode_emojis(text: str) -> List[str]:
    """
    提取文字中的 Unicode emoji

    Args:
        text: 原始文字

    Returns:
        emoji 列表
    """
    return [char for char in text if emoji.is_emoji(char)]


def extract_youtube_emotes(emotes_json: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    """
    提取 YouTube 自定義表情包

    Args:
        emotes_json: emotes JSONB 資料，格式為
                     [{name: ":emoji:", images: [{url: "https://..."}]}]

    Returns:
        簡化後的表情列表 [{name: ":emoji:", url: "https://..."}]
    """
    if not emotes_json:
        return []

    result = []
    for emote in emotes_json:
        name = emote.get('name', '')
        images = emote.get('images', [])
        url = images[0].get('url', '') if images else ''
        if name:
            result.append({'name': name, 'url': url})
    return result


def remove_emojis(text: str) -> str:
    """
    移除文字中的所有 emoji（包括 Unicode emoji）

    Args:
        text: 原始文字

    Returns:
        移除 emoji 後的文字
    """
    return emoji.replace_emoji(text, replace='')


def remove_youtube_emotes(text: str, emotes_json: Optional[List[Dict[str, Any]]]) -> str:
    """
    移除文字中的 YouTube 自定義表情

    Args:
        text: 原始文字
        emotes_json: emotes JSONB 資料

    Returns:
        移除 YouTube emotes 後的文字
    """
    if not emotes_json:
        return text

    result = text
    emote_names: List[str] = []
    for emote in emotes_json:
        name = emote.get('name', '')
        if not name:
            continue
        # Keep removal matching aligned with message normalization pipeline.
        normalized_name = normalize_text(name)
        if normalized_name:
            emote_names.append(normalized_name)

    # Remove longer names first to avoid partial leftovers on overlapping names.
    for name in sorted(set(emote_names), key=len, reverse=True):
        result = re.sub(re.escape(name), '', result, flags=re.IGNORECASE)
    return result


def tokenize_text(
    text: str,
    special_words: List[str],
    stopwords: Optional[Set[str]] = None
) -> List[str]:
    """
    使用 jieba 進行斷詞

    Args:
        text: 要斷詞的文字
        special_words: 特殊詞彙列表（會加入 jieba 詞典）
        stopwords: 停用詞集合（會被過濾掉）

    Returns:
        斷詞結果列表（已過濾停用詞）
    """
    # 加入特殊詞彙到 jieba 詞典
    for word in special_words:
        jieba.add_word(word)

    # 進行斷詞
    tokens = list(jieba.cut(text))

    # 過濾空白和空字串
    tokens = [t.strip().lower() for t in tokens if t.strip()]

    # 過濾停用詞
    if stopwords:
        tokens = [t for t in tokens if t not in stopwords]

    return tokens


def process_message(
    message: str,
    emotes_json: Optional[List[Dict[str, Any]]],
    replace_dict: Dict[str, str],
    special_words: List[str]
) -> Tuple[str, List[str], List[str], List[Dict[str, str]]]:
    """
    完整處理單條留言

    Args:
        message: 原始留言
        emotes_json: YouTube emotes JSONB 資料
        replace_dict: 替換詞彙字典
        special_words: 特殊詞彙列表

    Returns:
        tuple: (processed_message, tokens, unicode_emojis, youtube_emotes)
    """
    # 1. 提取 emoji 和 emotes（在任何處理之前）
    unicode_emojis = extract_unicode_emojis(message)
    youtube_emotes = extract_youtube_emotes(emotes_json)

    # 2. 正規化文字（全形轉半形、清理空白）— 移到 replace 之前
    processed = normalize_text(message)

    # 3. 套用替換詞彙（內部會 .lower()）
    processed = apply_replace_words(processed, replace_dict)

    # 4. 移除 emoji 和 YouTube emotes
    processed = remove_emojis(processed)
    processed = remove_youtube_emotes(processed, emotes_json)

    # 5. 清理多餘空白
    processed = re.sub(r'\s+', ' ', processed).strip()

    # 6. 載入停用詞並斷詞
    stopwords = load_stopwords()
    tokens = tokenize_text(processed, special_words, stopwords)

    return processed, tokens, unicode_emojis, youtube_emotes


def process_messages_batch(
    messages: List[Dict[str, Any]],
    replace_dict: Dict[str, str],
    special_words: List[str]
) -> List[Dict[str, Any]]:
    """
    批次處理多條留言

    Args:
        messages: 留言列表，每個元素包含 message_id, message, emotes 等欄位
        replace_dict: 替換詞彙字典
        special_words: 特殊詞彙列表

    Returns:
        處理後的留言列表
    """
    results = []
    for msg in messages:
        processed_message, tokens, unicode_emojis, youtube_emotes = process_message(
            message=msg['message'],
            emotes_json=msg.get('emotes'),
            replace_dict=replace_dict,
            special_words=special_words
        )
        results.append({
            'message_id': msg['message_id'],
            'live_stream_id': msg['live_stream_id'],
            'original_message': msg['message'],
            'processed_message': processed_message,
            'tokens': tokens,
            'unicode_emojis': unicode_emojis,
            'youtube_emotes': youtube_emotes,
            'author_name': msg['author_name'],
            'author_id': msg['author_id'],
            'published_at': msg['published_at']
        })
    return results
