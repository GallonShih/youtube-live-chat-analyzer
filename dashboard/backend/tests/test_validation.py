import pytest
from app.models import ReplaceWord, SpecialWord, PendingReplaceWord, PendingSpecialWord
from app.services.validation import (
    validate_replace_word,
    validate_special_word,
    batch_validate_replace_words,
    batch_validate_special_words
)

class TestValidateReplaceWord:
    def test_valid_replace_word(self, db):
        result = validate_replace_word(db, "錯字", "正字")
        assert result["valid"] == True
        assert result["conflicts"] == []
        assert result["warnings"] == []

    def test_same_source_and_target(self, db):
        result = validate_replace_word(db, "相同", "相同")
        assert result["valid"] == False
        assert any(c["type"] == "same_word" for c in result["conflicts"])

    def test_source_in_special_words(self, db):
        db.add(SpecialWord(word="特殊詞"))
        db.commit()
        
        result = validate_replace_word(db, "特殊詞", "目標")
        assert result["valid"] == False
        assert any(c["type"] == "source_in_special_words" for c in result["conflicts"])

    def test_source_in_special_words_case_insensitive(self, db):
        """Validation should detect conflict regardless of case."""
        db.add(SpecialWord(word="casematch特殊"))
        db.flush()

        result = validate_replace_word(db, "CaseMatch特殊", "目標")
        assert result["valid"] == False
        assert any(c["type"] == "source_in_special_words" for c in result["conflicts"])

    def test_source_in_target_words(self, db):
        db.add(ReplaceWord(source_word="原詞", target_word="中間詞"))
        db.commit()
        
        result = validate_replace_word(db, "中間詞", "最終詞")
        assert result["valid"] == False
        assert any(c["type"] == "source_in_target_words" for c in result["conflicts"])

    def test_source_already_exists_warning(self, db):
        db.add(ReplaceWord(source_word="錯字", target_word="舊正字"))
        db.commit()
        
        result = validate_replace_word(db, "錯字", "新正字")
        assert result["valid"] == True
        assert any(w["type"] == "source_already_exists" for w in result["warnings"])

    def test_target_in_special_words_no_warning(self, db):
        """Target being a special word is normal design (no warning)"""
        db.add(SpecialWord(word="目標詞"))
        db.commit()
        
        result = validate_replace_word(db, "錯字", "目標詞")
        assert result["valid"] == True
        # 不應該有警告 - Target 是 Special Word 是正常的設計
        assert result["warnings"] == []

    def test_duplicate_pending_warning(self, db):
        db.add(PendingReplaceWord(
            source_word="錯字", target_word="正字", status="pending"
        ))
        db.commit()
        
        result = validate_replace_word(db, "錯字", "正字")
        assert result["valid"] == True
        assert any(w["type"] == "duplicate_pending" for w in result["warnings"])

class TestValidateSpecialWord:
    def test_valid_special_word(self, db):
        result = validate_special_word(db, "新詞彙")
        assert result["valid"] == True
        assert result["conflicts"] == []

    def test_word_in_target_words(self, db):
        """Target words CAN be special words - this is the design intent"""
        db.add(ReplaceWord(source_word="錯字", target_word="正字"))
        db.commit()
        
        result = validate_special_word(db, "正字")
        # Target 可以是 Special Word（Word Discovery 會自動加入）
        assert result["valid"] == True
        assert result["conflicts"] == []


    def test_word_in_source_words_case_insensitive(self, db):
        """Validation should detect conflict regardless of case."""
        db.add(ReplaceWord(source_word="hololive", target_word="正字"))
        db.flush()

        result = validate_special_word(db, "HoloLive")
        assert result["valid"] == False
        assert any(c["type"] == "word_in_source_words" for c in result["conflicts"])

    def test_word_in_source_words(self, db):
        db.add(ReplaceWord(source_word="錯字", target_word="正字"))
        db.commit()
        
        result = validate_special_word(db, "錯字")
        assert result["valid"] == False
        assert any(c["type"] == "word_in_source_words" for c in result["conflicts"])

    def test_word_already_exists_warning(self, db):
        """Words already in special_words can be approved (idempotent)"""
        db.add(SpecialWord(word="現有詞"))
        db.commit()
        
        result = validate_special_word(db, "現有詞")
        # 允許批准（冪等設計），但有警告
        assert result["valid"] == True
        assert any(w["type"] == "word_already_exists" for w in result["warnings"])

class TestBatchValidation:
    def test_batch_validate_replace_words(self, db):
        pending1 = PendingReplaceWord(source_word="錯1", target_word="正1", status="pending")
        pending2 = PendingReplaceWord(source_word="錯2", target_word="正2", status="pending")
        db.add_all([pending1, pending2])
        db.commit()
        
        results = batch_validate_replace_words(db, [pending1.id, pending2.id])
        assert len(results) == 2
        assert results[pending1.id]["valid"] == True
        assert results[pending2.id]["valid"] == True

    def test_batch_validate_replace_words_not_found(self, db):
        results = batch_validate_replace_words(db, [999])
        assert results[999]["valid"] == False
        assert any(c["type"] == "not_found" for c in results[999]["conflicts"])

    def test_batch_validate_special_words(self, db):
        pending1 = PendingSpecialWord(word="詞1", status="pending")
        pending2 = PendingSpecialWord(word="詞2", status="pending")
        db.add_all([pending1, pending2])
        db.commit()
        
        results = batch_validate_special_words(db, [pending1.id, pending2.id])
        assert len(results) == 2
        assert results[pending1.id]["valid"] == True

    def test_batch_validate_special_words_not_found(self, db):
        results = batch_validate_special_words(db, [999])
        assert results[999]["valid"] == False
