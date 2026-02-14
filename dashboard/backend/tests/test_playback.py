import pytest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from app.models import StreamStats, ChatMessage, CurrencyRate

class TestPlaybackSnapshots:
    """Tests for the /api/playback/snapshots endpoint using in-memory SQLite."""

    def test_get_playback_snapshots_validation(self, client):
        """Test validation errors."""
        # End before start
        response = client.get(
            "/api/playback/snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T09:00:00",
                "step_seconds": 300
            }
        )
        assert response.status_code == 400
        assert "end_time must be after start_time" in response.json()["detail"]

        # Invalid step
        response = client.get(
            "/api/playback/snapshots",
            params={
                "start_time": "2024-01-02T10:00:00",
                "end_time": "2024-01-02T11:00:00",
                "step_seconds": 30
            }
        )
        assert response.status_code == 400

    def test_get_playback_snapshots_success(self, client, db):
        """Test successful retrieval of playback snapshots with real DB data."""
        start_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        end_time = datetime(2024, 1, 1, 10, 10, 0, tzinfo=timezone.utc)
        video_id = "video123"

        # Setup Data
        # 1. Viewer Stats
        db.add(StreamStats(
            live_stream_id=video_id,
            concurrent_viewers=100,
            collected_at=start_time
        ))
        db.add(StreamStats(
            live_stream_id=video_id,
            concurrent_viewers=150,
            collected_at=start_time + timedelta(minutes=5)
        ))

        # 2. Chat Messages
        # Message 1: Normal chat at 10:01
        db.add(ChatMessage(
            message_id="msg1",
            live_stream_id=video_id,
            message="Hello",
            published_at=start_time + timedelta(minutes=1),
            timestamp=int((start_time + timedelta(minutes=1)).timestamp() * 1000000),
            author_name="User1",
            author_id="u1",
            message_type="chat_message"
        ))
        # Message 2: Paid message at 10:06 (100 TWD)
        db.add(ChatMessage(
            message_id="msg2",
            live_stream_id=video_id,
            message="Donate",
            published_at=start_time + timedelta(minutes=6),
            timestamp=int((start_time + timedelta(minutes=6)).timestamp() * 1000000),
            author_name="User2",
            author_id="u2",
            message_type="paid_message",
            raw_data={"money": {"currency": "TWD", "amount": "100"}}
        ))

        # 3. Currency Rates
        db.add(CurrencyRate(currency="TWD", rate_to_twd=1.0))
        db.commit()

        # Run Test
        with patch('app.routers.playback.get_current_video_id', return_value=video_id):
            response = client.get(
                "/api/playback/snapshots",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                    "step_seconds": 300
                }
            )
            
            assert response.status_code == 200
            data = response.json()
            snapshots = data["snapshots"]
            
            assert len(snapshots) == 3
            
            # Snapshot 0: 10:00. Viewer count 100.
            assert snapshots[0]["timestamp"] == start_time.isoformat()
            assert snapshots[0]["viewer_count"] == 100
            
            # Snapshot 1: 10:05. Viewer count 150.
            # Msg1 (10:01) is <= 10:05. It's not paid.
            assert snapshots[1]["timestamp"] == (start_time + timedelta(minutes=5)).isoformat()
            assert snapshots[1]["viewer_count"] == 150
            assert snapshots[1]["paid_message_count"] == 0
            
            # Snapshot 2: 10:10.
            # Msg2 (10:06) is <= 10:10. Paid 100.
            assert snapshots[2]["paid_message_count"] == 1
            assert snapshots[2]["revenue_twd"] == 100.0

    def test_get_playback_snapshots_revenue_conversion(self, client, db):
        """Test revenue conversion with real DB data."""
        start_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        
        # Add USD Rate
        db.add(CurrencyRate(currency="USD", rate_to_twd=30.0))
        # Add Paid Message
        db.add(ChatMessage(
            message_id="msg_usd",
            live_stream_id="vid",
            message="USD Donate",
            published_at=start_time,
            timestamp=int(start_time.timestamp() * 1000000),
            author_name="User3",
            author_id="u3",
            message_type="paid_message",
            raw_data={"money": {"currency": "USD", "amount": "$10.00"}}
        ))
        db.commit()

        with patch('app.routers.playback.get_current_video_id', return_value="vid"):
            response = client.get(
                "/api/playback/snapshots",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": (start_time + timedelta(minutes=5)).isoformat(),
                    "step_seconds": 300
                }
            )
            assert response.status_code == 200
            data = response.json()
            assert data["snapshots"][0]["revenue_twd"] == 300.0

    def test_get_playback_snapshots_ticker_paid(self, client, db):
        """Test that ticker_paid_message_item is counted in paid messages and revenue."""
        start_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        end_time = datetime(2024, 1, 1, 10, 10, 0, tzinfo=timezone.utc)
        video_id = "video_ticker"

        db.add(CurrencyRate(currency="TWD", rate_to_twd=1.0))
        db.add(ChatMessage(
            message_id="ticker_msg1",
            live_stream_id=video_id,
            message="Ticker SC",
            published_at=start_time + timedelta(minutes=2),
            timestamp=int((start_time + timedelta(minutes=2)).timestamp() * 1000000),
            author_name="TickerUser",
            author_id="tu1",
            message_type="ticker_paid_message_item",
            raw_data={"money": {"currency": "TWD", "amount": "200"}}
        ))
        db.commit()

        with patch('app.routers.playback.get_current_video_id', return_value=video_id):
            response = client.get(
                "/api/playback/snapshots",
                params={
                    "start_time": start_time.isoformat(),
                    "end_time": end_time.isoformat(),
                    "step_seconds": 300
                }
            )
            assert response.status_code == 200
            data = response.json()
            snapshots = data["snapshots"]

            # Snapshot at 10:05 should include the ticker paid message (10:02)
            assert snapshots[1]["paid_message_count"] == 1
            assert snapshots[1]["revenue_twd"] == 200.0

    def test_get_playback_snapshots_hourly_messages(self, client, db):
        """Test hourly message calculation logic."""
        # 09:00:00 boundary test
        # Message at 08:59:00
        msg_time = datetime(2024, 1, 1, 8, 59, 0, tzinfo=timezone.utc)
        
        db.add(ChatMessage(
            message_id="m1",
            live_stream_id="v", 
            message="hi",
            published_at=msg_time,
            timestamp=int(msg_time.timestamp() * 1000000),
            author_name="u",
            author_id="u",
            message_type="chat_message"
        ))
        db.commit()

        with patch('app.routers.playback.get_current_video_id', return_value="v"):
            response = client.get(
                "/api/playback/snapshots",
                params={
                    "start_time": "2024-01-01T08:55:00+00:00",
                    "end_time": "2024-01-01T09:05:00+00:00",
                    "step_seconds": 300
                }
            )
            data = response.json()
            snapshots = data["snapshots"]
            
            # 08:55 snapshot: hour start 08:00. msg (08:59) is NOT < 08:55.
            assert snapshots[0]["hourly_messages"] == 0
            
            # 09:00 snapshot: Exact hour. Uses prev hour (08:00-09:00).
            # msg (08:59) is in 08:00-09:00.
            assert snapshots[1]["hourly_messages"] == 1
            
            # 09:05 snapshot: hour start 09:00. msg (08:59) is not in range.
            assert snapshots[2]["hourly_messages"] == 0
