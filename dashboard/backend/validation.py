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
    conflicts = []
    warnings = []
    
    if source_word == target_word:
        conflicts.append({
            "type": "same_word",
            "message": f"source_word 和 target_word 不能相同: '{source_word}'"
        })
    
    special = db.query(SpecialWord).filter(
        SpecialWord.word == source_word
    ).first()
    if special:
        conflicts.append({
            "type": "source_in_special_words",
            "message": f"source_word '{source_word}' 已存在於 special_words，不能被替換"
        })
    
    existing_target = db.query(ReplaceWord).filter(
        ReplaceWord.target_word == source_word
    ).first()
    if existing_target:
        conflicts.append({
            "type": "source_in_target_words",
            "message": f"source_word '{source_word}' 已是另一個替換詞的 target_word (來自 '{existing_target.source_word}')"
        })
    
    existing_source = db.query(ReplaceWord).filter(
        ReplaceWord.source_word == source_word
    ).first()
    if existing_source and existing_source.target_word != target_word:
        warnings.append({
            "type": "source_already_exists",
            "message": f"source_word '{source_word}' 已存在，原 target_word 為 '{existing_source.target_word}'，將被更新為 '{target_word}'"
        })
    
    target_special = db.query(SpecialWord).filter(
        SpecialWord.word == target_word
    ).first()
    if target_special:
        warnings.append({
            "type": "target_in_special_words",
            "message": f"target_word '{target_word}' 存在於 special_words 中，請確認是否正確"
        })
    
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
    conflicts = []
    warnings = []
    
    target = db.query(ReplaceWord).filter(
        ReplaceWord.target_word == word
    ).first()
    if target:
        conflicts.append({
            "type": "word_in_target_words",
            "message": f"word '{word}' 已是替換詞的 target_word (來自 '{target.source_word}')，不能同時為 special_word"
        })
    
    source = db.query(ReplaceWord).filter(
        ReplaceWord.source_word == word
    ).first()
    if source:
        conflicts.append({
            "type": "word_in_source_words",
            "message": f"word '{word}' 已是替換詞的 source_word (將被替換為 '{source.target_word}')，不能同時為 special_word"
        })
    
    existing = db.query(SpecialWord).filter(
        SpecialWord.word == word
    ).first()
    if existing:
        warnings.append({
            "type": "word_already_exists",
            "message": f"word '{word}' 已存在於 special_words 中"
        })
    
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
