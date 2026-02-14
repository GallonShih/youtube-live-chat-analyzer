def test_get_chat_messages_empty(client):
    response = client.get("/api/chat/messages")
    assert response.status_code == 200
    data = response.json()
    assert data["messages"] == []
    assert data["total"] == 0
    assert data["limit"] == 100
    assert data["offset"] == 0

def test_get_chat_messages_with_data(client, sample_chat_messages):
    response = client.get("/api/chat/messages")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 10
    assert data["total"] == 10

def test_get_chat_messages_with_limit(client, sample_chat_messages):
    response = client.get("/api/chat/messages?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 3
    assert data["total"] == 10

def test_get_chat_messages_with_offset(client, sample_chat_messages):
    response = client.get("/api/chat/messages?limit=5&offset=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data["messages"]) == 5
    assert data["offset"] == 5

def test_get_chat_messages_max_limit(client, sample_chat_messages):
    response = client.get("/api/chat/messages?limit=1000")
    assert response.status_code == 200
    data = response.json()
    assert data["limit"] == 500

def test_get_chat_messages_paid_only(client, sample_chat_messages):
    response = client.get("/api/chat/messages?paid_message_filter=paid_only")
    assert response.status_code == 200
    data = response.json()
    # 4 paid_message (1,3,5,7) + 1 ticker_paid_message_item (9) = 5
    assert data["total"] == 5
    paid_types = {"paid_message", "ticker_paid_message_item"}
    for msg in data["messages"]:
        assert msg["message_type"] in paid_types

def test_get_chat_messages_non_paid_only(client, sample_chat_messages):
    response = client.get("/api/chat/messages?paid_message_filter=non_paid_only")
    assert response.status_code == 200
    data = response.json()
    # 5 text_message (0,2,4,6,8)
    assert data["total"] == 5
    paid_types = {"paid_message", "ticker_paid_message_item"}
    for msg in data["messages"]:
        assert msg["message_type"] not in paid_types

def test_get_chat_messages_author_filter(client, sample_chat_messages):
    response = client.get("/api/chat/messages?author_filter=User1")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1

def test_get_chat_messages_message_filter(client, sample_chat_messages):
    response = client.get("/api/chat/messages?message_filter=Test")
    assert response.status_code == 200
    data = response.json()


# Test top-authors endpoint
def test_get_top_authors_empty(client):
    """Test top authors endpoint with no data."""
    response = client.get("/api/chat/top-authors")
    assert response.status_code == 200
    assert response.json() == []


def test_get_top_authors_with_data(client, sample_chat_messages):
    """Test top authors endpoint with sample data."""
    response = client.get("/api/chat/top-authors")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        assert "author" in data[0]
        assert "count" in data[0]


def test_get_top_authors_with_filters(client, sample_chat_messages):
    """Test top authors with message filter."""
    response = client.get("/api/chat/top-authors?message_filter=Test")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_top_authors_paid_only(client, sample_chat_messages):
    """Test top authors filtered to paid messages only."""
    response = client.get("/api/chat/top-authors?paid_message_filter=paid_only")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_get_top_authors_with_time_range(client, sample_chat_messages):
    """Test top authors with time range filter."""
    response = client.get(
        "/api/chat/top-authors?start_time=2026-01-01T00:00:00&end_time=2026-12-31T23:59:59"
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
