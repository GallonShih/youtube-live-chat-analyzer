"""Unit tests for text mining API."""
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import text


@pytest.fixture
def processed_chat_messages_table(db):
    """Create the processed_chat_messages table for testing."""
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS processed_chat_messages (
            message_id VARCHAR(255) PRIMARY KEY,
            live_stream_id VARCHAR(255) NOT NULL,
            original_message TEXT NOT NULL,
            processed_message TEXT NOT NULL,
            tokens TEXT[],
            unicode_emojis TEXT[],
            youtube_emotes JSONB,
            author_name VARCHAR(255) NOT NULL,
            author_id VARCHAR(255) NOT NULL,
            published_at TIMESTAMP WITH TIME ZONE NOT NULL,
            processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.commit()
    yield
    # Table will be cleaned up by transaction rollback


class TestTextMiningAnalyze:
    """Tests for POST /api/text-mining/analyze endpoint."""

    def test_analyze_basic(self, client, db, processed_chat_messages_table):
        """Test basic text mining analysis."""
        # Insert test data
        now = datetime.now(timezone.utc)
        db.execute(
            text("""
            INSERT INTO processed_chat_messages 
            (message_id, live_stream_id, original_message, processed_message, 
             author_name, author_id, published_at)
            VALUES 
            (:id1, 'stream1', '老師好棒', '老師好棒', 'user1', 'uid1', :time1),
            (:id2, 'stream1', '老師好厲害', '老師好厲害', 'user2', 'uid2', :time2),
            (:id3, 'stream1', '謝謝老師', '謝謝老師', 'user3', 'uid3', :time3)
            """),
            {
                "id1": "msg_tm_1",
                "id2": "msg_tm_2", 
                "id3": "msg_tm_3",
                "time1": now - timedelta(hours=1),
                "time2": now - timedelta(minutes=30),
                "time3": now - timedelta(minutes=15),
            }
        )
        db.commit()

        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": (now - timedelta(hours=2)).isoformat(),
                "end_time": now.isoformat(),
                "target_word": "老師"
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Check structure
        assert "original_message" in data
        assert "processed_message" in data
        assert "stats" in data

        # Check stats
        assert data["stats"]["total_messages"] == 3
        assert data["stats"]["matched_original"] == 3
        assert data["stats"]["matched_processed"] == 3

        # Check forward extension for original message
        assert "forward" in data["original_message"]
        assert "1" in data["original_message"]["forward"]
        # "好" should be in the top results for 1-char forward extension
        forward_1 = data["original_message"]["forward"]["1"]
        assert len(forward_1) > 0
        texts = [item["text"] for item in forward_1]
        assert "好" in texts

        # Check backward extension
        assert "backward" in data["original_message"]
        assert "2" in data["original_message"]["backward"]
        backward_2 = data["original_message"]["backward"]["2"]
        texts = [item["text"] for item in backward_2]
        assert "謝謝" in texts

    def test_analyze_no_matches(self, client, db, processed_chat_messages_table):
        """Test analysis when target word has no matches."""
        now = datetime.now(timezone.utc)
        db.execute(
            text("""
            INSERT INTO processed_chat_messages 
            (message_id, live_stream_id, original_message, processed_message,
             author_name, author_id, published_at)
            VALUES (:id, 'stream1', '測試訊息', '測試訊息', 'user1', 'uid1', :time)
            """),
            {"id": "msg_tm_no_match", "time": now - timedelta(minutes=30)}
        )
        db.commit()

        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": (now - timedelta(hours=1)).isoformat(),
                "end_time": now.isoformat(),
                "target_word": "不存在的詞"
            }
        )

        assert response.status_code == 200
        data = response.json()

        assert data["stats"]["matched_original"] == 0
        assert data["stats"]["matched_processed"] == 0

        # All extension results should be empty
        for length in ["1", "2", "3", "4", "5"]:
            assert data["original_message"]["forward"][length] == []
            assert data["original_message"]["backward"][length] == []

    def test_analyze_time_filter(self, client, db, processed_chat_messages_table):
        """Test that time filtering works correctly."""
        now = datetime.now(timezone.utc)
        
        # Insert messages at different times
        db.execute(
            text("""
            INSERT INTO processed_chat_messages 
            (message_id, live_stream_id, original_message, processed_message,
             author_name, author_id, published_at)
            VALUES 
            (:id1, 'stream1', '老師早', '老師早', 'user1', 'uid1', :time1),
            (:id2, 'stream1', '老師晚', '老師晚', 'user2', 'uid2', :time2)
            """),
            {
                "id1": "msg_tm_time_1",
                "id2": "msg_tm_time_2",
                "time1": now - timedelta(hours=5),  # Outside range
                "time2": now - timedelta(hours=1),  # Inside range
            }
        )
        db.commit()

        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": (now - timedelta(hours=2)).isoformat(),
                "end_time": now.isoformat(),
                "target_word": "老師"
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Only one message should be in range
        assert data["stats"]["total_messages"] == 1
        assert data["stats"]["matched_original"] == 1

        # "晚" should be in forward extension, not "早"
        forward_1 = data["original_message"]["forward"]["1"]
        texts = [item["text"] for item in forward_1]
        assert "晚" in texts
        assert "早" not in texts

    def test_analyze_validation_error(self, client):
        """Test validation errors for missing fields."""
        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                # Missing target_word
            }
        )

        assert response.status_code == 422  # Validation error

    def test_analyze_whitespace_boundary_rules(
        self, client, db, processed_chat_messages_table
    ):
        """Forward excludes trailing whitespace; backward excludes leading whitespace."""
        now = datetime.now(timezone.utc)
        db.execute(
            text("""
            INSERT INTO processed_chat_messages 
            (message_id, live_stream_id, original_message, processed_message,
             author_name, author_id, published_at)
            VALUES
            -- Forward examples
            (:id1, 'stream1', '吉祥妳來 ', '吉祥妳來 ', 'user1', 'uid1', :time1),   -- 3-char forward ends with space -> exclude
            (:id2, 'stream1', '吉祥 妳來', '吉祥 妳來', 'user2', 'uid2', :time2),   -- 3-char forward starts with space -> keep
            -- Backward examples
            (:id3, 'stream1', ' 妳來吉祥', ' 妳來吉祥', 'user3', 'uid3', :time3),   -- 3-char backward starts with space -> exclude
            (:id4, 'stream1', '妳 來吉祥', '妳 來吉祥', 'user4', 'uid4', :time4)    -- 3-char backward middle space -> keep
            """),
            {
                "id1": "msg_tm_ws_1",
                "id2": "msg_tm_ws_2",
                "id3": "msg_tm_ws_3",
                "id4": "msg_tm_ws_4",
                "time1": now - timedelta(minutes=40),
                "time2": now - timedelta(minutes=30),
                "time3": now - timedelta(minutes=20),
                "time4": now - timedelta(minutes=10),
            }
        )
        db.commit()

        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": (now - timedelta(hours=1)).isoformat(),
                "end_time": now.isoformat(),
                "target_word": "吉祥"
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Forward length 3: keep " 妳來", exclude "妳來 "
        forward_3 = data["original_message"]["forward"]["3"]
        texts_3 = [item["text"] for item in forward_3]
        assert " 妳來" in texts_3
        assert "妳來 " not in texts_3

        # Backward length 3: keep "妳 來", exclude " 妳來"
        backward_3 = data["original_message"]["backward"]["3"]
        back_texts_3 = [item["text"] for item in backward_3]
        assert "妳 來" in back_texts_3
        assert " 妳來" not in back_texts_3

    def test_analyze_empty_target_word(self, client):
        """Test validation for empty target word."""
        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                "target_word": ""
            }
        )

        assert response.status_code == 422  # Validation error

    def test_analyze_counts_by_message_not_occurrence(
        self, client, db, processed_chat_messages_table
    ):
        """Same extension repeated in one message should count once."""
        now = datetime.now(timezone.utc)
        db.execute(
            text("""
            INSERT INTO processed_chat_messages
            (message_id, live_stream_id, original_message, processed_message,
             author_name, author_id, published_at)
            VALUES
            (:id1, 'stream1', '老師好老師好', '老師好老師好', 'user1', 'uid1', :time1),
            (:id2, 'stream1', '老師好', '老師好', 'user2', 'uid2', :time2)
            """),
            {
                "id1": "msg_tm_dedupe_1",
                "id2": "msg_tm_dedupe_2",
                "time1": now - timedelta(minutes=20),
                "time2": now - timedelta(minutes=10),
            }
        )
        db.commit()

        response = client.post(
            "/api/text-mining/analyze",
            json={
                "start_time": (now - timedelta(hours=1)).isoformat(),
                "end_time": now.isoformat(),
                "target_word": "老師"
            }
        )

        assert response.status_code == 200
        data = response.json()

        forward_1 = data["original_message"]["forward"]["1"]
        count_by_text = {item["text"]: item["count"] for item in forward_1}
        assert count_by_text.get("好") == 2
