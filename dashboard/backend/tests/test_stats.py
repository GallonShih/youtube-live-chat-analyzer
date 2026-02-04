import pytest

def test_get_viewer_stats_empty(client):
    response = client.get("/api/stats/viewers")
    assert response.status_code == 200
    assert response.json() == []

def test_get_viewer_stats_with_data(client, sample_stream_stats):
    response = client.get("/api/stats/viewers")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5
    assert "time" in data[0]
    assert "count" in data[0]

def test_get_viewer_stats_with_limit(client, sample_stream_stats):
    response = client.get("/api/stats/viewers?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_get_viewer_stats_with_hours(client, sample_stream_stats):
    """Test viewer stats with hours filter."""
    response = client.get("/api/stats/viewers?hours=24")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_viewer_stats_with_time_range(client, sample_stream_stats):
    """Test viewer stats with explicit time range."""
    response = client.get(
        "/api/stats/viewers?start_time=2026-01-01T00:00:00&end_time=2026-12-31T23:59:59"
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_comment_stats_empty(client):
    """Test comment stats with no data - uses PostgreSQL date_trunc."""
    response = client.get("/api/stats/comments")
    assert response.status_code == 200
    assert response.json() == []


def test_get_comment_stats_with_data(client, sample_chat_messages):
    """Test comment stats with sample data."""
    response = client.get("/api/stats/comments?hours=24")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_comment_stats_with_time_range(client, sample_chat_messages):
    """Test comment stats with explicit time range."""
    response = client.get(
        "/api/stats/comments?start_time=2026-01-01T00:00:00&end_time=2026-12-31T23:59:59"
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_money_summary_empty(client):
    response = client.get("/api/stats/money-summary")
    assert response.status_code == 200
    data = response.json()
    assert data["total_amount_twd"] == 0
    assert data["paid_message_count"] == 0
    assert data["top_authors"] == []

def test_get_money_summary_with_data(client, sample_chat_messages, sample_currency_rates):
    response = client.get("/api/stats/money-summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_amount_twd" in data
    assert "paid_message_count" in data
    assert "top_authors" in data
    assert "unknown_currencies" in data


def test_get_money_summary_with_time_range(client, sample_chat_messages, sample_currency_rates):
    """Test money summary with time range filter."""
    response = client.get(
        "/api/stats/money-summary?start_time=2026-01-01T00:00:00&end_time=2026-12-31T23:59:59"
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_amount_twd" in data
    assert "paid_message_count" in data


def test_get_money_summary_calculates_correctly(client, db, sample_currency_rates):
    """Test money summary calculates correct amounts."""
    from datetime import datetime, timezone
    from app.models import ChatMessage
    
    # Create a paid message with known amount
    msg = ChatMessage(
        message_id="paid_msg_1",
        live_stream_id="test_stream",
        message="Thanks!",
        timestamp=1704067200000000,
        published_at=datetime(2026, 1, 12, 10, 0, 0, tzinfo=timezone.utc),
        author_name="BigSpender",
        author_id="spender_1",
        message_type="paid_message",
        raw_data={"money": {"currency": "USD", "amount": "10"}}
    )
    db.add(msg)
    db.flush()
    
    response = client.get("/api/stats/money-summary")
    assert response.status_code == 200
    data = response.json()
    
    # USD rate is 31.5, so 10 USD = 315 TWD
    assert data["paid_message_count"] >= 1
    assert data["total_amount_twd"] >= 315.0


def test_get_money_summary_unknown_currency(client, db, sample_currency_rates):
    """Test money summary tracks unknown currencies."""
    from datetime import datetime, timezone
    from app.models import ChatMessage
    
    msg = ChatMessage(
        message_id="paid_unknown_cur",
        live_stream_id="test_stream",
        message="Thanks!",
        timestamp=1704067200000000,
        published_at=datetime(2026, 1, 12, 10, 0, 0, tzinfo=timezone.utc),
        author_name="ForeignSpender",
        author_id="foreign_1",
        message_type="paid_message",
        raw_data={"money": {"currency": "EUR", "amount": "50"}}
    )
    db.add(msg)
    db.flush()
    
    response = client.get("/api/stats/money-summary")
    assert response.status_code == 200
    data = response.json()
    
    assert "EUR" in data["unknown_currencies"]
