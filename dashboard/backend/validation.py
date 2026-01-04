"""
Validation logic for word review system
驗證待審核詞彙的業務邏輯
"""

from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from models import ReplaceWord, SpecialWord, PendingReplaceWord, PendingSpecialWord
import logging

logger = logging.getLogger(__name__)


def validate_replace_word(
    db: Session,
    source_word: str,
    target_word: str,
    pending_id: Optional[int] = None
) -> Dict:
    """
    驗證 replace word 是否有衝突
    
    規則：
    1. source_word 不能在 special_words 中
    2. source_word 不能在 replace_words.target_word 中
    3. target_word 不能在 special_words 中（警告）
    4. source_word 不能與 target_word 相同
    
    Args:
        db: Database session
        source_word: 原詞
        target_word: 目標詞
        pending_id: 待審核詞彙 ID（用於排除自己）
    
    Returns:
        {
            "valid": bool,
            "conflicts": List[Dict],
            "warnings": List[Dict]
        }
    """
    conflicts = []
    warnings = []
    
    # 基本驗證：source_word 和 target_word 不能相同
    if source_word == target_word:
        conflicts.append({
            "type": "same_word",
            "message": f"source_word 和 target_word 不能相同: '{source_word}'"
        })
    
    # 檢查 source_word 是否在 special_words
    special = db.query(SpecialWord).filter(
        SpecialWord.word == source_word
    ).first()
    if special:
        conflicts.append({
            "type": "source_in_special_words",
            "message": f"source_word '{source_word}' 已存在於 special_words，不能被替換"
        })
    
    # 檢查 source_word 是否為其他 replace_words 的 target_word
    existing_target = db.query(ReplaceWord).filter(
        ReplaceWord.target_word == source_word
    ).first()
    if existing_target:
        conflicts.append({
            "type": "source_in_target_words",
            "message": f"source_word '{source_word}' 已是另一個替換詞的 target_word (來自 '{existing_target.source_word}')"
        })
    
    # 檢查 source_word 是否已經存在於 replace_words（但允許更新 target_word）
    existing_source = db.query(ReplaceWord).filter(
        ReplaceWord.source_word == source_word
    ).first()
    if existing_source and existing_source.target_word != target_word:
        warnings.append({
            "type": "source_already_exists",
            "message": f"source_word '{source_word}' 已存在，原 target_word 為 '{existing_source.target_word}'，將被更新為 '{target_word}'"
        })
    
    # 檢查 target_word 是否在 special_words（警告）
    target_special = db.query(SpecialWord).filter(
        SpecialWord.word == target_word
    ).first()
    if target_special:
        warnings.append({
            "type": "target_in_special_words",
            "message": f"target_word '{target_word}' 存在於 special_words 中，請確認是否正確"
        })
    
    # 檢查是否在待審核列表中已有相同的組合（排除自己）
    query = db.query(PendingReplaceWord).filter(
        PendingReplaceWord.source_word == source_word,
        PendingReplaceWord.target_word == target_word,
        PendingReplaceWord.status == 'pending'
    )
    if pending_id:
        query = query.filter(PendingReplaceWord.id != pending_id)
    
    duplicate = query.first()
    if duplicate:
        warnings.append({
            "type": "duplicate_pending",
            "message": f"待審核列表中已有相同的替換詞組合 (ID: {duplicate.id})"
        })
    
    return {
        "valid": len(conflicts) == 0,
        "conflicts": conflicts,
        "warnings": warnings
    }


def validate_special_word(
    db: Session,
    word: str,
    pending_id: Optional[int] = None
) -> Dict:
    """
    驗證 special word 是否有衝突
    
    規則：
    1. word 不能在 replace_words.target_word 中
    2. word 不能在 replace_words.source_word 中
    3. word 不能已存在於 special_words 中
    
    Args:
        db: Database session
        word: 特殊詞彙
        pending_id: 待審核詞彙 ID（用於排除自己）
    
    Returns:
        {
            "valid": bool,
            "conflicts": List[Dict],
            "warnings": List[Dict]
        }
    """
    conflicts = []
    warnings = []
    
    # 檢查是否為 replace_words 的 target_word
    target = db.query(ReplaceWord).filter(
        ReplaceWord.target_word == word
    ).first()
    if target:
        conflicts.append({
            "type": "word_in_target_words",
            "message": f"word '{word}' 已是替換詞的 target_word (來自 '{target.source_word}')，不能同時為 special_word"
        })
    
    # 檢查是否為 replace_words 的 source_word
    source = db.query(ReplaceWord).filter(
        ReplaceWord.source_word == word
    ).first()
    if source:
        conflicts.append({
            "type": "word_in_source_words",
            "message": f"word '{word}' 已是替換詞的 source_word (將被替換為 '{source.target_word}')，不能同時為 special_word"
        })
    
    # 檢查是否已存在於 special_words
    existing = db.query(SpecialWord).filter(
        SpecialWord.word == word
    ).first()
    if existing:
        warnings.append({
            "type": "word_already_exists",
            "message": f"word '{word}' 已存在於 special_words 中"
        })
    
    # 檢查是否在待審核列表中已有相同的詞（排除自己）
    query = db.query(PendingSpecialWord).filter(
        PendingSpecialWord.word == word,
        PendingSpecialWord.status == 'pending'
    )
    if pending_id:
        query = query.filter(PendingSpecialWord.id != pending_id)
    
    duplicate = query.first()
    if duplicate:
        warnings.append({
            "type": "duplicate_pending",
            "message": f"待審核列表中已有相同的特殊詞 (ID: {duplicate.id})"
        })
    
    return {
        "valid": len(conflicts) == 0,
        "conflicts": conflicts,
        "warnings": warnings
    }


def batch_validate_replace_words(
    db: Session,
    word_ids: List[int]
) -> Dict[int, Dict]:
    """
    批量驗證多個 replace words
    
    Args:
        db: Database session
        word_ids: 待審核詞彙 ID 列表
    
    Returns:
        {
            word_id: validation_result,
            ...
        }
    """
    results = {}
    
    for word_id in word_ids:
        pending = db.query(PendingReplaceWord).filter(
            PendingReplaceWord.id == word_id
        ).first()
        
        if not pending:
            results[word_id] = {
                "valid": False,
                "conflicts": [{
                    "type": "not_found",
                    "message": f"找不到 ID 為 {word_id} 的待審核詞彙"
                }],
                "warnings": []
            }
            continue
        
        results[word_id] = validate_replace_word(
            db,
            pending.source_word,
            pending.target_word,
            pending_id=word_id
        )
    
    return results


def batch_validate_special_words(
    db: Session,
    word_ids: List[int]
) -> Dict[int, Dict]:
    """
    批量驗證多個 special words
    
    Args:
        db: Database session
        word_ids: 待審核詞彙 ID 列表
    
    Returns:
        {
            word_id: validation_result,
            ...
        }
    """
    results = {}
    
    for word_id in word_ids:
        pending = db.query(PendingSpecialWord).filter(
            PendingSpecialWord.id == word_id
        ).first()
        
        if not pending:
            results[word_id] = {
                "valid": False,
                "conflicts": [{
                    "type": "not_found",
                    "message": f"找不到 ID 為 {word_id} 的待審核詞彙"
                }],
                "warnings": []
            }
            continue
        
        results[word_id] = validate_special_word(
            db,
            pending.word,
            pending_id=word_id
        )
    
    return results
