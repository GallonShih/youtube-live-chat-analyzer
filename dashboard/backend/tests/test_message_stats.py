def test_get_message_stats_empty(client):
    response = client.get("/api/chat/message-stats")
    assert response.status_code == 200
    data = response.json()
    assert data == []


def test_get_message_stats_with_data(client, sample_chat_messages):
    response = client.get("/api/chat/message-stats")
    assert response.status_code == 200
    data = response.json()
    # All sample messages are in the same hour (2026-01-12 10:00-10:09)
    assert len(data) == 1
    assert data[0]["count"] == 10
    assert "hour" in data[0]


def test_get_message_stats_paid_only(client, sample_chat_messages):
    response = client.get("/api/chat/message-stats?paid_message_filter=paid_only")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    # Odd indices are paid: 1,3,5,7 = paid_message, 9 = ticker_paid_message_item (5 total)
    assert data[0]["count"] == 5


def test_get_message_stats_non_paid_only(client, sample_chat_messages):
    response = client.get("/api/chat/message-stats?paid_message_filter=non_paid_only")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    # Even indices are non-paid messages (0,2,4,6,8) = 5 messages
    assert data[0]["count"] == 5


def test_get_message_stats_author_filter(client, sample_chat_messages):
    response = client.get("/api/chat/message-stats?author_filter=User1")
    assert response.status_code == 200
    data = response.json()
    # Should match User1 only
    assert len(data) == 1
    assert data[0]["count"] == 1


def test_get_message_stats_message_filter(client, sample_chat_messages):
    response = client.get("/api/chat/message-stats?message_filter=message%205")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["count"] == 1


def test_get_message_stats_combined_filters(client, sample_chat_messages):
    # Filter for paid messages with "message" in content
    response = client.get(
        "/api/chat/message-stats?paid_message_filter=paid_only&message_filter=Test"
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["count"] == 5


def test_get_message_stats_with_time_range(client, sample_chat_messages):
    """Test message stats with explicit time range."""
    response = client.get(
        "/api/chat/message-stats?start_time=2026-01-01T00:00:00&end_time=2026-12-31T23:59:59"
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_message_stats_with_since(client, sample_chat_messages):
    """Test message stats with 'since' parameter for incremental updates."""
    response = client.get("/api/chat/message-stats?since=2026-01-12T10:00:00")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
