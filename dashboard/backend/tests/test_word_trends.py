"""
Unit tests for word trends router.
Tests CRUD operations for word groups and trend statistics.
"""
import pytest
from unittest.mock import Mock, patch


@pytest.fixture
def sample_word_groups(db):
    """Create sample word trend groups."""
    from app.models import WordTrendGroup
    
    groups = [
        WordTrendGroup(name='Group 1', words=['word1', 'word2'], color='#FF0000'),
        WordTrendGroup(name='Group 2', words=['word3', 'word4'], color='#00FF00'),
        WordTrendGroup(name='Group 3', words=['word5'], color='#0000FF')
    ]
    db.add_all(groups)
    db.flush()
    
    # Return list of dicts for compatibility
    return [{'id': g.id, 'name': g.name, 'words': g.words, 'color': g.color} for g in groups]


@pytest.fixture
def sample_messages_for_trends(db):
    """Create sample chat messages for trend testing."""
    from app.models import ChatMessage
    from datetime import datetime, timezone
    
    # Create messages at different hours with specific words
    messages_data = [
        # Hour 0: word1 appears 3 times
        ("msg_1", "This contains word1", datetime(2026, 1, 12, 10, 0, 0, tzinfo=timezone.utc)),
        ("msg_2", "Another word1 message", datetime(2026, 1, 12, 10, 15, 0, tzinfo=timezone.utc)),
        ("msg_3", "Yet another word1", datetime(2026, 1, 12, 10, 30, 0, tzinfo=timezone.utc)),
        
        # Hour 0: word3 appears 2 times
        ("msg_4", "This has word3", datetime(2026, 1, 12, 10, 45, 0, tzinfo=timezone.utc)),
        ("msg_5", "Another word3", datetime(2026, 1, 12, 10, 50, 0, tzinfo=timezone.utc)),
        
        # Hour 1: word1 appears 1 time
        ("msg_6", "word1 in hour 1", datetime(2026, 1, 12, 11, 10, 0, tzinfo=timezone.utc)),
        
        # Hour 1: word3 appears 1 time
        ("msg_7", "word3 in hour 1", datetime(2026, 1, 12, 11, 20, 0, tzinfo=timezone.utc)),
        
        # Hour 2: word5 appears 2 times
        ("msg_8", "word5 appears here", datetime(2026, 1, 12, 12, 10, 0, tzinfo=timezone.utc)),
        ("msg_9", "word5 again", datetime(2026, 1, 12, 12, 30, 0, tzinfo=timezone.utc)),
    ]
    
    messages = []
    for msg_id, message, published_at in messages_data:
        timestamp = int(published_at.timestamp() * 1000000)
        msg = ChatMessage(
            message_id=msg_id,
            live_stream_id='test_stream',
            message=message,
            timestamp=timestamp,
            published_at=published_at,
            author_name='TestUser',
            author_id='user_1',
            message_type='text_message'
        )
        messages.append(msg)
    
    db.add_all(messages)
    db.flush()


# ============ CRUD Tests ============

def test_list_word_groups_empty(client, db):
    """Test listing word groups when none exist."""
    response = client.get("/api/word-trends/groups")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


def test_list_word_groups(client, sample_word_groups):
    """Test listing all word groups."""
    response = client.get("/api/word-trends/groups")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert data[0]["name"] == "Group 1"
    assert data[0]["words"] == ["word1", "word2"]
    assert data[0]["color"] == "#FF0000"


def test_get_word_group(client, sample_word_groups):
    """Test getting a specific word group."""
    group_id = sample_word_groups[0]["id"]
    response = client.get(f"/api/word-trends/groups/{group_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Group 1"
    assert data["words"] == ["word1", "word2"]
    assert data["color"] == "#FF0000"


def test_get_word_group_not_found(client, db):
    """Test getting a non-existent word group."""
    response = client.get("/api/word-trends/groups/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_create_word_group(admin_client, db):
    """Test creating a new word group."""
    data = {
        "name": "New Group",
        "words": ["test1", "test2", "test3"],
        "color": "#AABBCC"
    }
    response = admin_client.post("/api/word-trends/groups", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["name"] == "New Group"
    assert result["words"] == ["test1", "test2", "test3"]
    assert result["color"] == "#AABBCC"
    assert "id" in result
    assert "created_at" in result


def test_create_word_group_default_color(admin_client, db):
    """Test creating a word group with default color."""
    data = {
        "name": "Default Color Group",
        "words": ["word1"]
    }
    response = admin_client.post("/api/word-trends/groups", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["color"] == "#5470C6"  # Default color


def test_create_word_group_duplicate_name(admin_client, sample_word_groups):
    """Test creating a word group with duplicate name."""
    data = {
        "name": "Group 1",  # Already exists
        "words": ["test"]
    }
    response = admin_client.post("/api/word-trends/groups", json=data)
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_create_word_group_invalid_data(admin_client, db):
    """Test creating a word group with invalid data."""
    # Empty name
    response = admin_client.post("/api/word-trends/groups", json={
        "name": "",
        "words": ["test"]
    })
    assert response.status_code == 422

    # Empty words list
    response = admin_client.post("/api/word-trends/groups", json={
        "name": "Test",
        "words": []
    })
    assert response.status_code == 422


def test_update_word_group(admin_client, sample_word_groups):
    """Test updating a word group."""
    group_id = sample_word_groups[0]["id"]
    update_data = {
        "name": "Updated Group",
        "words": ["new1", "new2"],
        "color": "#FFFFFF"
    }
    response = admin_client.put(f"/api/word-trends/groups/{group_id}", json=update_data)
    assert response.status_code == 200
    result = response.json()
    assert result["name"] == "Updated Group"
    assert result["words"] == ["new1", "new2"]
    assert result["color"] == "#FFFFFF"


def test_update_word_group_partial(admin_client, sample_word_groups):
    """Test partial update of a word group."""
    group_id = sample_word_groups[0]["id"]

    # Only update name
    response = admin_client.put(f"/api/word-trends/groups/{group_id}", json={
        "name": "Partially Updated"
    })
    assert response.status_code == 200
    result = response.json()
    assert result["name"] == "Partially Updated"
    assert result["words"] == ["word1", "word2"]  # Unchanged
    assert result["color"] == "#FF0000"  # Unchanged


def test_update_word_group_not_found(admin_client, db):
    """Test updating a non-existent word group."""
    response = admin_client.put("/api/word-trends/groups/99999", json={
        "name": "Test"
    })
    assert response.status_code == 404


def test_update_word_group_duplicate_name(admin_client, sample_word_groups):
    """Test updating to a duplicate name."""
    group_id = sample_word_groups[0]["id"]
    response = admin_client.put(f"/api/word-trends/groups/{group_id}", json={
        "name": "Group 2"  # Name of another group
    })
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"].lower()


def test_delete_word_group(admin_client, sample_word_groups):
    """Test deleting a word group."""
    group_id = sample_word_groups[0]["id"]
    response = admin_client.delete(f"/api/word-trends/groups/{group_id}")
    assert response.status_code == 200
    assert response.json()["message"] == "Word group deleted successfully"

    # Verify it's deleted
    response = admin_client.get(f"/api/word-trends/groups/{group_id}")
    assert response.status_code == 404


def test_delete_word_group_not_found(admin_client, db):
    """Test deleting a non-existent word group."""
    response = admin_client.delete("/api/word-trends/groups/99999")
    assert response.status_code == 404


# ============ Trend Statistics Tests ============

@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats(mock_get_video_id, client, sample_word_groups, sample_messages_for_trends):
    """Test getting trend statistics for word groups."""
    mock_get_video_id.return_value = 'test_stream'
    
    # Get trend stats for Group 1 (contains word1, word2)
    group_id = sample_word_groups[0]["id"]
    request_data = {
        "group_ids": [group_id],
        "start_time": "2026-01-12T09:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert "groups" in data
    assert len(data["groups"]) == 1
    
    group_data = data["groups"][0]
    assert group_data["group_id"] == group_id
    assert group_data["name"] == "Group 1"
    assert group_data["color"] == "#FF0000"
    assert "data" in group_data
    
    # word1 appears in hour 0 (3 times) and hour 1 (1 time)
    hourly_counts = {item["hour"]: item["count"] for item in group_data["data"]}
    # API returns ISO format with timezone
    assert hourly_counts.get("2026-01-12T10:00:00+00:00") == 3
    assert hourly_counts.get("2026-01-12T11:00:00+00:00") == 1


@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats_multiple_groups(mock_get_video_id, client, sample_word_groups, sample_messages_for_trends):
    """Test getting trend stats for multiple groups."""
    mock_get_video_id.return_value = 'test_stream'
    
    group_ids = [g["id"] for g in sample_word_groups[:2]]
    request_data = {
        "group_ids": group_ids,
        "start_time": "2026-01-12T11:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert len(data["groups"]) == 2


@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats_with_time_range(mock_get_video_id, client, sample_word_groups, sample_messages_for_trends):
    """Test getting trend stats with time range filter."""
    mock_get_video_id.return_value = 'test_stream'
    
    group_id = sample_word_groups[0]["id"]
    request_data = {
        "group_ids": [group_id],
        "start_time": "2026-01-12T11:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()
    
    # Should only include data from hour 1 onwards
    group_data = data["groups"][0]
    hourly_counts = {item["hour"]: item["count"] for item in group_data["data"]}
    
    # Hour 0 should not be included
    assert "2026-01-12T10:00:00+00:00" not in hourly_counts
    # Hour 1 should be included
    assert "2026-01-12T11:00:00+00:00" in hourly_counts


@patch('app.routers.word_trends.get_current_video_id')
def test_get_trend_stats_no_data(mock_get_video_id, client, sample_word_groups, db):
    """Test getting trend stats when no messages exist."""
    mock_get_video_id.return_value = 'test_stream'
    
    group_id = sample_word_groups[0]["id"]
    request_data = {
        "group_ids": [group_id],
        "start_time": "2026-01-12T11:00:00Z",
        "end_time": "2026-01-12T13:00:00Z"
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 200
    data = response.json()
    assert len(data["groups"]) == 1
    assert data["groups"][0]["data"] == []


def test_get_trend_stats_invalid_group(client, db):
    """Test getting trend stats for non-existent group."""
    request_data = {
        "group_ids": [99999]
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 404


def test_get_trend_stats_empty_group_ids(client, db):
    """Test getting trend stats with empty group_ids."""
    request_data = {
        "group_ids": []
    }
    
    response = client.post("/api/word-trends/stats", json=request_data)
    assert response.status_code == 422  # Validation error
