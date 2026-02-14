"""Tests for emoji statistics endpoint."""
import pytest
import json
from datetime import datetime, timezone, timedelta


@pytest.fixture
def sample_messages_with_emojis(db):
    """Create sample processed messages with various emoji types."""
    from app.models import ProcessedChatMessage

    # Use recent time so it passes the default 12-hour filter
    base_time = datetime.now(timezone.utc) - timedelta(minutes=30)

    messages = [
        # Message with YouTube emotes
        ProcessedChatMessage(
            message_id="msg_yt_1",
            live_stream_id="test_stream",
            original_message=":ytEmote1: Hello :ytEmote2:",
            processed_message="Hello",
            tokens=["Hello"],
            unicode_emojis=[],
            youtube_emotes=[
                {"name": ":ytEmote1:", "url": "https://example.com/yt1.png"},
                {"name": ":ytEmote2:", "url": "https://example.com/yt2.png"}
            ],
            published_at=base_time,
            author_name="User1",
            author_id="user_1",
        ),
        # Another message with same YouTube emote
        ProcessedChatMessage(
            message_id="msg_yt_2",
            live_stream_id="test_stream",
            original_message=":ytEmote1: Again!",
            processed_message="Again!",
            tokens=["Again"],
            unicode_emojis=[],
            youtube_emotes=[
                {"name": ":ytEmote1:", "url": "https://example.com/yt1.png"}
            ],
            published_at=base_time + timedelta(minutes=1),
            author_name="User2",
            author_id="user_2",
        ),
        # Message with Unicode emojis
        ProcessedChatMessage(
            message_id="msg_unicode_1",
            live_stream_id="test_stream",
            original_message="Hello 😀 World 🎉",
            processed_message="Hello World",
            tokens=["Hello", "World"],
            unicode_emojis=["😀", "🎉"],
            youtube_emotes=[],
            published_at=base_time + timedelta(minutes=2),
            author_name="User3",
            author_id="user_3",
        ),
        # Message with same Unicode emoji
        ProcessedChatMessage(
            message_id="msg_unicode_2",
            live_stream_id="test_stream",
            original_message="Another 😀 message",
            processed_message="Another message",
            tokens=["Another", "message"],
            unicode_emojis=["😀"],
            youtube_emotes=[],
            published_at=base_time + timedelta(minutes=3),
            author_name="User4",
            author_id="user_4",
        ),
        # Message with both types
        ProcessedChatMessage(
            message_id="msg_mixed",
            live_stream_id="test_stream",
            original_message=":ytEmote1: plus 🎉 mixed",
            processed_message="plus mixed",
            tokens=["plus", "mixed"],
            unicode_emojis=["🎉"],
            youtube_emotes=[
                {"name": ":ytEmote1:", "url": "https://example.com/yt1.png"}
            ],
            published_at=base_time + timedelta(minutes=4),
            author_name="User5",
            author_id="user_5",
        ),
    ]

    db.add_all(messages)
    db.flush()
    return messages


class TestEmojiStats:
    """Tests for /api/emojis/stats endpoint."""

    def test_empty_stats(self, client, db):
        """Test empty response when no messages exist."""
        response = client.get("/api/emojis/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["emojis"] == []
        assert data["total"] == 0

    def test_youtube_emote_aggregation(self, client, sample_messages_with_emojis):
        """Test YouTube emotes are properly aggregated."""
        response = client.get("/api/emojis/stats")
        assert response.status_code == 200
        data = response.json()

        # Find :ytEmote1: - should appear in 3 messages
        yt_emote1 = next((e for e in data["emojis"] if e["name"] == ":ytEmote1:"), None)
        assert yt_emote1 is not None
        assert yt_emote1["is_youtube_emoji"] is True
        assert yt_emote1["image_url"] == "https://example.com/yt1.png"
        assert yt_emote1["message_count"] == 3

        # Find :ytEmote2: - should appear in 1 message
        yt_emote2 = next((e for e in data["emojis"] if e["name"] == ":ytEmote2:"), None)
        assert yt_emote2 is not None
        assert yt_emote2["is_youtube_emoji"] is True
        assert yt_emote2["message_count"] == 1

    def test_unicode_emoji_aggregation(self, client, sample_messages_with_emojis):
        """Test Unicode emojis are properly extracted and aggregated."""
        response = client.get("/api/emojis/stats")
        assert response.status_code == 200
        data = response.json()

        # Find 😀 - should appear in 2 messages
        smile_emoji = next((e for e in data["emojis"] if e["name"] == "😀"), None)
        assert smile_emoji is not None
        assert smile_emoji["is_youtube_emoji"] is False
        assert smile_emoji["image_url"] is None
        assert smile_emoji["message_count"] == 2

        # Find 🎉 - should appear in 2 messages
        party_emoji = next((e for e in data["emojis"] if e["name"] == "🎉"), None)
        assert party_emoji is not None
        assert party_emoji["is_youtube_emoji"] is False
        assert party_emoji["message_count"] == 2

    def test_time_filter(self, client, sample_messages_with_emojis):
        """Test time range filtering."""
        # Use the base time from the first message in fixture
        base_time = sample_messages_with_emojis[0].published_at

        # Filter to only first 2 minutes
        start = base_time.strftime("%Y-%m-%dT%H:%M:%S")
        end = (base_time + timedelta(minutes=1, seconds=30)).strftime("%Y-%m-%dT%H:%M:%S")

        response = client.get("/api/emojis/stats", params={"start_time": start, "end_time": end})
        assert response.status_code == 200
        data = response.json()

        # Only messages from first 2 minutes should be included
        # :ytEmote1: appears in msg_yt_1 and msg_yt_2 (within range)
        yt_emote1 = next((e for e in data["emojis"] if e["name"] == ":ytEmote1:"), None)
        assert yt_emote1 is not None
        assert yt_emote1["message_count"] == 2

        # Unicode emojis should not appear (messages are after the time range)
        smile_emoji = next((e for e in data["emojis"] if e["name"] == "😀"), None)
        assert smile_emoji is None

    def test_pagination(self, client, sample_messages_with_emojis):
        """Test pagination works correctly."""
        # Get first page with limit 2
        response = client.get("/api/emojis/stats?limit=2&offset=0")
        assert response.status_code == 200
        data = response.json()

        assert len(data["emojis"]) == 2
        assert data["limit"] == 2
        assert data["offset"] == 0
        # Total should be greater than 2
        assert data["total"] > 2

        # Get second page
        response = client.get("/api/emojis/stats?limit=2&offset=2")
        data2 = response.json()
        assert len(data2["emojis"]) > 0
        assert data2["offset"] == 2

    def test_filter_by_name(self, client, sample_messages_with_emojis):
        """Test filtering by emoji name."""
        response = client.get("/api/emojis/stats?filter=ytEmote1")
        assert response.status_code == 200
        data = response.json()

        # Should only include emojis matching the filter
        assert len(data["emojis"]) == 1
        assert data["emojis"][0]["name"] == ":ytEmote1:"

    def test_sorted_by_message_count(self, client, sample_messages_with_emojis):
        """Test results are sorted by message count descending."""
        response = client.get("/api/emojis/stats")
        assert response.status_code == 200
        data = response.json()

        counts = [e["message_count"] for e in data["emojis"]]
        assert counts == sorted(counts, reverse=True)

    def test_type_filter(self, client, sample_messages_with_emojis):
        """Test filtering by emoji type (youtube/unicode)."""
        # Test YouTube filter
        response = client.get("/api/emojis/stats?type_filter=youtube")
        assert response.status_code == 200
        data = response.json()

        # Should only contain YouTube emojis
        for emoji in data["emojis"]:
            assert emoji["is_youtube_emoji"] is True

        # :ytEmote1: and :ytEmote2:
        assert len(data["emojis"]) == 2

        # Test Unicode filter
        response = client.get("/api/emojis/stats?type_filter=unicode")
        assert response.status_code == 200
        data = response.json()

        # Should only contain Unicode emojis
        for emoji in data["emojis"]:
            assert emoji["is_youtube_emoji"] is False

        # 😀 and 🎉
        assert len(data["emojis"]) == 2
