"""Tests for incense map router.

Uses real PostgreSQL (hermes_test) to validate regexp_match SQL,
with get_current_video_id patched to return a known video_id.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import patch

from app.models import ChatMessage

VIDEO_ID = "test_incense_stream"
PATCH_TARGET = "app.routers.incense_map.get_current_video_id"


def make_message(msg_id, message, published_at):
    return ChatMessage(
        message_id=msg_id,
        live_stream_id=VIDEO_ID,
        message=message,
        timestamp=1704067200000000,
        published_at=published_at,
        author_name="TestUser",
        author_id="user_test",
    )


@pytest.fixture
def incense_messages(db):
    """Insert chat messages with 代表上香 pattern for testing."""
    t = lambda h, m: datetime(2026, 1, 12, h, m, 0, tzinfo=timezone.utc)
    messages = [
        make_message("inc_01", "台中代表上香\\|/", t(10, 0)),
        make_message("inc_02", "台中代表上香", t(10, 5)),
        make_message("inc_03", "台中代表上香!", t(10, 10)),
        make_message("inc_04", "高雄代表上香\\|/", t(10, 15)),
        make_message("inc_05", "高雄代表上香", t(10, 20)),
        make_message("inc_06", "台北代表上香", t(11, 0)),
        make_message("inc_07", "上香", t(11, 5)),                      # 無地區，不應被計入
        make_message("inc_08", "有人要幫刈包上香嗎？", t(11, 10)),     # 無代表，不應被計入
        make_message("inc_09", "其他訊息", t(11, 15)),                  # 完全無關
    ]
    db.add_all(messages)
    db.flush()
    return messages


class TestGetIncenseCandidates:

    def test_empty_returns_zero(self, client):
        """無任何訊息時，回傳空結果且 total_matched 為 0。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        assert response.status_code == 200
        data = response.json()
        assert data["total_matched"] == 0
        assert data["unique_candidates"] == 0
        assert data["candidates"] == []

    def test_response_structure(self, client, incense_messages):
        """回應結構包含必要欄位。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        assert response.status_code == 200
        data = response.json()
        assert "total_matched" in data
        assert "unique_candidates" in data
        assert "candidates" in data
        assert isinstance(data["candidates"], list)

    def test_candidate_item_structure(self, client, incense_messages):
        """每個候選詞項目包含 word、count、percentage。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        data = response.json()
        first = data["candidates"][0]
        assert "word" in first
        assert "count" in first
        assert "percentage" in first

    def test_correct_counts(self, client, incense_messages):
        """台中 3 次、高雄 2 次、台北 1 次，共 6 則。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        data = response.json()
        assert data["total_matched"] == 6
        assert data["unique_candidates"] == 3

        words = {c["word"]: c["count"] for c in data["candidates"]}
        assert words["台中"] == 3
        assert words["高雄"] == 2
        assert words["台北"] == 1

    def test_sorted_by_count_desc(self, client, incense_messages):
        """候選詞按 count 降冪排序。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        counts = [c["count"] for c in response.json()["candidates"]]
        assert counts == sorted(counts, reverse=True)

    def test_non_matching_messages_excluded(self, client, incense_messages):
        """無地區前綴的上香訊息不被計入（inc_07、inc_08）。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        data = response.json()
        words = [c["word"] for c in data["candidates"]]
        # 純「上香」和「幫刈包上香」不應出現
        assert "上香" not in words
        assert "刈包" not in words

    def test_percentage_calculation(self, client, incense_messages):
        """percentage = count / total_matched * 100，台中應為 50.0%。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get("/api/incense-map/candidates")
        data = response.json()
        total = data["total_matched"]  # 6
        words = {c["word"]: c for c in data["candidates"]}
        assert words["台中"]["percentage"] == round(3 / total * 100, 2)

    def test_time_filter_start_time(self, client, incense_messages):
        """start_time=11:00 只應返回台北（inc_06），台中/高雄在 10:xx 被排除。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get(
                "/api/incense-map/candidates?start_time=2026-01-12T11:00:00"
            )
        data = response.json()
        words = {c["word"]: c["count"] for c in data["candidates"]}
        assert "台北" in words
        assert words["台北"] == 1
        assert "台中" not in words
        assert "高雄" not in words

    def test_time_filter_end_time(self, client, incense_messages):
        """end_time=10:05 只應返回台中前兩筆（inc_01、inc_02）。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get(
                "/api/incense-map/candidates?end_time=2026-01-12T10:05:00"
            )
        data = response.json()
        words = {c["word"]: c["count"] for c in data["candidates"]}
        assert words.get("台中") == 2
        assert "高雄" not in words
        assert "台北" not in words

    def test_time_filter_range(self, client, incense_messages):
        """start + end 時間範圍同時過濾，只返回 10:05~10:20 的訊息（台中1、高雄2）。"""
        with patch(PATCH_TARGET, return_value=VIDEO_ID):
            response = client.get(
                "/api/incense-map/candidates"
                "?start_time=2026-01-12T10:05:00"
                "&end_time=2026-01-12T10:20:00"
            )
        data = response.json()
        words = {c["word"]: c["count"] for c in data["candidates"]}
        assert words.get("台中") == 2   # inc_02 (10:05) + inc_03 (10:10)
        assert words.get("高雄") == 2   # inc_04 (10:15) + inc_05 (10:20)
        assert "台北" not in words
