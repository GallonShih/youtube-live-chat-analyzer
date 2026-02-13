"""
Unit Tests for ORM Helper Functions

Tests the utility functions in app/utils/orm_helpers.py
Uses PostgreSQL test database via conftest.py fixtures.
"""

import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import ProcessedChatMessage, MeaninglessWord
from app.utils.orm_helpers import (
    bulk_upsert,
    bulk_upsert_do_nothing,
    safe_commit,
    safe_bulk_insert
)


def _make_processed_msg(message_id, **overrides):
    """Helper to create ProcessedChatMessage data dict."""
    defaults = {
        "message_id": message_id,
        "live_stream_id": "test_stream",
        "original_message": f"原始_{message_id}",
        "processed_message": f"處理_{message_id}",
        "tokens": ["測試", "消息"],
        "unicode_emojis": [],
        "youtube_emotes": {},
        "author_name": "TestUser",
        "author_id": "test_author",
        "published_at": datetime.now(timezone.utc),
    }
    defaults.update(overrides)
    return defaults


class TestBulkUpsert:
    """Tests for bulk_upsert function."""

    def test_insert_new_records(self, db: Session):
        """Test inserting new records with bulk_upsert."""
        data = [
            _make_processed_msg("upsert_001", author_name="User1"),
            _make_processed_msg("upsert_002", author_name="User2"),
        ]

        count = bulk_upsert(
            db, ProcessedChatMessage, data,
            constraint_columns=['message_id']
        )
        db.flush()

        assert count == 2

        messages = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id.in_(["upsert_001", "upsert_002"])
        ).all()
        assert len(messages) == 2

        msg1 = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "upsert_001"
        ).first()
        assert msg1 is not None
        assert msg1.author_name == "User1"

    def test_update_existing_records(self, db: Session):
        """Test updating existing records with bulk_upsert."""
        # First insert
        initial_data = [_make_processed_msg(
            "upsert_upd_001",
            processed_message="原始消息",
            tokens=["原始"],
        )]
        bulk_upsert(db, ProcessedChatMessage, initial_data, ['message_id'])
        db.flush()

        # Update with same message_id
        update_data = [_make_processed_msg(
            "upsert_upd_001",
            processed_message="已更新的消息",
            tokens=["已", "更新"],
            unicode_emojis=["😀"],
        )]
        count = bulk_upsert(
            db, ProcessedChatMessage, update_data,
            constraint_columns=['message_id'],
            update_columns=['processed_message', 'tokens', 'unicode_emojis']
        )
        db.flush()

        assert count == 1

        msg = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "upsert_upd_001"
        ).first()
        assert msg.processed_message == "已更新的消息"
        assert msg.tokens == ["已", "更新"]
        assert msg.unicode_emojis == ["😀"]

    def test_empty_data(self, db: Session):
        """Test bulk_upsert with empty data list."""
        count = bulk_upsert(
            db, ProcessedChatMessage, [],
            constraint_columns=['message_id']
        )
        assert count == 0

    def test_mixed_insert_and_update(self, db: Session):
        """Test bulk_upsert with mix of new and existing records."""
        # Insert initial record
        initial = [_make_processed_msg("upsert_mix_001", processed_message="原始")]
        bulk_upsert(db, ProcessedChatMessage, initial, ['message_id'])
        db.flush()

        # Mix of update and insert
        mixed_data = [
            _make_processed_msg("upsert_mix_001", processed_message="已更新"),
            _make_processed_msg("upsert_mix_002", processed_message="新消息"),
        ]
        count = bulk_upsert(db, ProcessedChatMessage, mixed_data, ['message_id'])
        db.flush()

        assert count == 2

        msg1 = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "upsert_mix_001"
        ).first()
        assert msg1.processed_message == "已更新"

        msg2 = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "upsert_mix_002"
        ).first()
        assert msg2.processed_message == "新消息"

    def test_update_all_columns_by_default(self, db: Session):
        """Test that update_columns=None updates all non-constraint columns."""
        initial = [_make_processed_msg(
            "upsert_all_001",
            processed_message="V1",
            author_name="OldName",
        )]
        bulk_upsert(db, ProcessedChatMessage, initial, ['message_id'])
        db.flush()

        updated = [_make_processed_msg(
            "upsert_all_001",
            processed_message="V2",
            author_name="NewName",
        )]
        bulk_upsert(
            db, ProcessedChatMessage, updated,
            constraint_columns=['message_id'],
            update_columns=None  # Update all
        )
        db.flush()

        msg = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "upsert_all_001"
        ).first()
        assert msg.processed_message == "V2"
        assert msg.author_name == "NewName"


class TestBulkUpsertDoNothing:
    """Tests for bulk_upsert_do_nothing function."""

    def test_insert_new_records(self, db: Session):
        """Test inserting new records (no conflicts)."""
        data = [
            {"word": "do_nothing_1"},
            {"word": "do_nothing_2"},
            {"word": "do_nothing_3"},
        ]

        count = bulk_upsert_do_nothing(
            db, MeaninglessWord, data,
            constraint_columns=['word']
        )
        db.flush()

        assert count == 3

        words = db.query(MeaninglessWord).filter(
            MeaninglessWord.word.in_(["do_nothing_1", "do_nothing_2", "do_nothing_3"])
        ).all()
        assert len(words) == 3

    def test_ignore_duplicates(self, db: Session):
        """Test that duplicates are silently ignored."""
        initial_data = [
            {"word": "dup_word_1"},
            {"word": "dup_word_2"},
        ]
        bulk_upsert_do_nothing(db, MeaninglessWord, initial_data, ['word'])
        db.flush()

        # Try to insert again with one duplicate and one new
        new_data = [
            {"word": "dup_word_1"},  # Duplicate
            {"word": "dup_word_3"},  # New
        ]
        count = bulk_upsert_do_nothing(db, MeaninglessWord, new_data, ['word'])
        db.flush()

        assert count == 1

        total = db.query(MeaninglessWord).filter(
            MeaninglessWord.word.in_(["dup_word_1", "dup_word_2", "dup_word_3"])
        ).count()
        assert total == 3

    def test_empty_data(self, db: Session):
        """Test with empty data list."""
        count = bulk_upsert_do_nothing(db, MeaninglessWord, [], ['word'])
        assert count == 0


class TestSafeCommit:
    """Tests for safe_commit function."""

    def test_successful_commit(self, db: Session):
        """Test successful commit."""
        msg = ProcessedChatMessage(
            message_id="safe_commit_001",
            live_stream_id="test_stream",
            original_message="測試",
            processed_message="測試",
            tokens=["測試"],
            unicode_emojis=[],
            youtube_emotes={},
            author_name="TestUser",
            author_id="test_author",
            published_at=datetime.now(timezone.utc),
        )
        db.add(msg)

        result = safe_commit(db)
        assert result is True

        count = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id == "safe_commit_001"
        ).count()
        assert count == 1

    def test_commit_failure_rollback(self, db: Session):
        """Test that failed commits trigger rollback on constraint violation."""
        # Insert first record
        msg1 = ProcessedChatMessage(
            message_id="safe_rollback_001",
            live_stream_id="test_stream",
            original_message="測試",
            processed_message="測試",
            tokens=["測試"],
            unicode_emojis=[],
            youtube_emotes={},
            author_name="TestUser",
            author_id="test_author",
            published_at=datetime.now(timezone.utc),
        )
        db.add(msg1)
        db.flush()

        # Try to insert duplicate primary key
        msg2 = ProcessedChatMessage(
            message_id="safe_rollback_001",  # Same PK
            live_stream_id="test_stream",
            original_message="重複",
            processed_message="重複",
            tokens=["重複"],
            unicode_emojis=[],
            youtube_emotes={},
            author_name="TestUser2",
            author_id="test_author_2",
            published_at=datetime.now(timezone.utc),
        )
        db.add(msg2)

        with pytest.raises(Exception):
            safe_commit(db)


class TestSafeBulkInsert:
    """Tests for safe_bulk_insert function."""

    def test_bulk_insert_small_batch(self, db: Session):
        """Test bulk insert with small dataset."""
        data = [
            _make_processed_msg(f"bulk_{i:03d}")
            for i in range(10)
        ]

        count = safe_bulk_insert(db, ProcessedChatMessage, data, batch_size=5)
        assert count == 10

        total = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id.like("bulk_%")
        ).count()
        assert total == 10

    def test_bulk_insert_empty_data(self, db: Session):
        """Test bulk insert with empty data."""
        count = safe_bulk_insert(db, ProcessedChatMessage, [], batch_size=100)
        assert count == 0

    def test_bulk_insert_batching(self, db: Session):
        """Test that batching works correctly with various sizes."""
        data = [
            _make_processed_msg(f"batch_{i:03d}")
            for i in range(25)
        ]

        # batch_size=10 → 3 batches: 10, 10, 5
        count = safe_bulk_insert(db, ProcessedChatMessage, data, batch_size=10)
        assert count == 25

        total = db.query(ProcessedChatMessage).filter(
            ProcessedChatMessage.message_id.like("batch_%")
        ).count()
        assert total == 25
