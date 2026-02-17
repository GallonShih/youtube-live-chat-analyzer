"""Tests for playback wordcloud router.

Note: The playback wordcloud router uses PostgreSQL-specific features (unnest for arrays),
so we mock the database execute calls to test the endpoint logic.
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta


def _make_mock_result(rows):
    """Create a mock DB result that supports both iteration and fetchall."""
    mock_result = MagicMock()
    mock_result.__iter__ = lambda self: iter(rows)
    mock_result.fetchall.return_value = rows
    return mock_result


class TestWordFrequencySnapshots:
    """Tests for the /api/playback/word-frequency-snapshots endpoint."""

    def test_validation_end_before_start(self, client):
        """Test validation error when end_time is before start_time."""
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T09:00:00",
                "step_seconds": 300
            }
        )
        assert response.status_code == 400
        assert "end_time must be after start_time" in response.json()["detail"]

    def test_validation_step_too_small(self, client):
        """Test validation error when step_seconds is too small."""
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "step_seconds": 30
            }
        )
        assert response.status_code == 400
        assert "step_seconds must be at least 60" in response.json()["detail"]

    def test_validation_step_too_large(self, client):
        """Test validation error when step_seconds is too large."""
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "step_seconds": 7200
            }
        )
        assert response.status_code == 400
        assert "step_seconds must be at most 3600" in response.json()["detail"]

    def test_validation_invalid_window_hours(self, client):
        """Test validation error when window_hours is invalid."""
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "step_seconds": 300,
                "window_hours": 3  # Invalid, should be 1/4/8/12/24
            }
        )
        assert response.status_code == 400
        assert "window_hours must be one of" in response.json()["detail"]

    def test_validation_word_limit_range(self, client):
        """Test validation error when word_limit is out of range."""
        # Too small
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "word_limit": 5
            }
        )
        assert response.status_code == 422

        # Too large
        response = client.get(
            "/api/playback/word-frequency-snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "word_limit": 200
            }
        )
        assert response.status_code == 422

    def test_empty_result(self, client):
        """Test endpoint returns empty snapshots when no data."""
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:10:00",
                        "step_seconds": 300
                    }
                )
                assert response.status_code == 200
                data = response.json()
                assert "snapshots" in data
                assert "metadata" in data
                assert len(data["snapshots"]) == 3  # 10:00, 10:05, 10:10
                assert all(len(s["words"]) == 0 for s in data["snapshots"])
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_with_word_data(self, client):
        """Test endpoint returns word frequency data correctly."""
        # All messages at 09:00 — within the 4h window for both snapshots (10:00, 10:05)
        pub = datetime(2024, 1, 2, 9, 0, 0, tzinfo=timezone.utc)
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            # Returns (message_id, published_at, word) 3-tuples
            mock_result = _make_mock_result([
                ("msg1", pub, "哈哈"),
                ("msg2", pub, "哈哈"),
                ("msg3", pub, "哈哈"),
                ("msg1", pub, "好"),
                ("msg2", pub, "好"),
                ("msg1", pub, "讚"),
            ])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:05:00",
                        "step_seconds": 300,
                        "window_hours": 4
                    }
                )
                assert response.status_code == 200
                data = response.json()

                assert len(data["snapshots"]) == 2
                assert data["metadata"]["window_hours"] == 4

                # First snapshot should have word data
                words = data["snapshots"][0]["words"]
                assert len(words) == 3
                # 哈哈 appears in 3 messages
                assert words[0] == {"word": "哈哈", "size": 3}
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_excludes_punctuation(self, client):
        """Test endpoint excludes punctuation from results."""
        pub = datetime(2024, 1, 2, 9, 0, 0, tzinfo=timezone.utc)
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([
                ("msg1", pub, "哈哈"),
                ("msg2", pub, "哈哈"),
                ("msg1", pub, "!"),  # Should be excluded
                ("msg2", pub, "。"),  # Should be excluded
                ("msg1", pub, "好"),
            ])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:05:00",
                        "step_seconds": 300
                    }
                )
                assert response.status_code == 200
                data = response.json()
                words = [w["word"] for w in data["snapshots"][0]["words"]]
                assert "哈哈" in words
                assert "好" in words
                assert "!" not in words
                assert "。" not in words
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_with_custom_exclude_words(self, client):
        """Test endpoint with custom exclude_words parameter."""
        pub = datetime(2024, 1, 2, 9, 0, 0, tzinfo=timezone.utc)
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([
                ("msg1", pub, "哈哈"),
                ("msg2", pub, "哈哈"),
                ("msg1", pub, "好"),
                ("msg1", pub, "讚"),
            ])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:05:00",
                        "step_seconds": 300,
                        "exclude_words": "哈哈,好"
                    }
                )
                assert response.status_code == 200
                data = response.json()
                words = [w["word"] for w in data["snapshots"][0]["words"]]
                assert "哈哈" not in words
                assert "好" not in words
                assert "讚" in words
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_with_wordlist_id(self, client, db):
        """Test endpoint with wordlist_id parameter."""
        from app.models import ExclusionWordlist

        # Create a test wordlist
        wordlist = ExclusionWordlist(
            name="test_wordlist",
            words=["哈哈", "好"]
        )
        db.add(wordlist)
        db.commit()
        db.refresh(wordlist)

        pub = datetime(2024, 1, 2, 9, 0, 0, tzinfo=timezone.utc)
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([
                ("msg1", pub, "哈哈"),
                ("msg2", pub, "哈哈"),
                ("msg1", pub, "好"),
                ("msg1", pub, "讚"),
            ])

            from app.core.database import get_db
            from main import app

            # Create a mock db that returns the real wordlist but mocks the text query
            def mock_db_override():
                # Just use the real db but mock execute
                mock_db = MagicMock()
                mock_db.execute.return_value = mock_result
                mock_db.query.return_value.filter.return_value.first.return_value = wordlist
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:05:00",
                        "step_seconds": 300,
                        "wordlist_id": wordlist.id
                    }
                )
                assert response.status_code == 200
                data = response.json()
                words = [w["word"] for w in data["snapshots"][0]["words"]]
                # Words from wordlist should be excluded
                assert "哈哈" not in words
                assert "好" not in words
                assert "讚" in words
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_metadata_response(self, client):
        """Test metadata in response is correct."""
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value="video123"):
            mock_result = _make_mock_result([])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T11:00:00",
                        "step_seconds": 600,
                        "window_hours": 8,
                        "word_limit": 50
                    }
                )
                assert response.status_code == 200
                data = response.json()

                meta = data["metadata"]
                assert meta["step_seconds"] == 600
                assert meta["window_hours"] == 8
                assert meta["word_limit"] == 50
                assert meta["video_id"] == "video123"
                assert meta["total_snapshots"] == 7  # 60 min / 10 min + 1
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_database_error_handling(self, client):
        """Test endpoint handles database errors gracefully."""
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.query.return_value.filter.return_value.first.return_value = None
            mock_db.execute.side_effect = Exception("Database connection failed")

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T11:00:00",
                        "step_seconds": 300
                    }
                )
                assert response.status_code == 500
                assert "detail" in response.json()
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_sliding_window_words_enter_and_leave(self, client):
        """Verify words appear/disappear as the sliding window moves."""
        # Window = 1 hour, step = 300s (5 min)
        # Snapshots at: 10:00, 10:05, 10:10, ...
        # "early" word at 09:01 — in window for 10:00 (covers 09:00-10:00)
        #                        but NOT for 10:05 (covers 09:05-10:05)
        # "late" word at 09:56 — in window for both 10:00 and 10:05
        early = datetime(2024, 1, 2, 9, 1, 0, tzinfo=timezone.utc)
        late = datetime(2024, 1, 2, 9, 56, 0, tzinfo=timezone.utc)

        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([
                ("msg1", early, "early_word"),
                ("msg2", late, "late_word"),
            ])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T10:05:00",
                        "step_seconds": 300,
                        "window_hours": 1,
                    }
                )
                assert response.status_code == 200
                data = response.json()
                assert len(data["snapshots"]) == 2

                # Snapshot 0 at 10:00: window [09:00, 10:00) — both words present
                words_0 = {w["word"] for w in data["snapshots"][0]["words"]}
                assert "early_word" in words_0
                assert "late_word" in words_0

                # Snapshot 1 at 10:05: window [09:05, 10:05) — early_word left
                words_1 = {w["word"] for w in data["snapshots"][1]["words"]}
                assert "early_word" not in words_1
                assert "late_word" in words_1
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)

    def test_single_query_execution(self, client):
        """Assert db.execute is called exactly once (not per-snapshot)."""
        with patch('app.routers.playback_wordcloud.get_current_video_id', return_value=None):
            mock_result = _make_mock_result([])

            from app.core.database import get_db
            from main import app

            mock_db = MagicMock()
            mock_db.execute.return_value = mock_result
            mock_db.query.return_value.filter.return_value.first.return_value = None

            def mock_db_override():
                yield mock_db

            original_override = app.dependency_overrides.get(get_db)
            app.dependency_overrides[get_db] = mock_db_override

            try:
                response = client.get(
                    "/api/playback/word-frequency-snapshots",
                    params={
                        "start_time": "2024-01-02T10:00:00",
                        "end_time": "2024-01-02T11:00:00",
                        "step_seconds": 300,  # 13 snapshots
                    }
                )
                assert response.status_code == 200
                # Only 1 execute call regardless of snapshot count
                assert mock_db.execute.call_count == 1
            finally:
                if original_override:
                    app.dependency_overrides[get_db] = original_override
                else:
                    app.dependency_overrides.pop(get_db, None)
