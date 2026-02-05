def test_get_all_settings_empty(client):
    response = client.get("/api/admin/settings")
    assert response.status_code == 200
    data = response.json()
    assert "settings" in data

def test_get_setting_not_exists(client):
    response = client.get("/api/admin/settings/nonexistent")
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "nonexistent"
    assert data["value"] is None

def test_create_setting(admin_client):
    response = admin_client.post("/api/admin/settings", json={
        "key": "test_key",
        "value": "test_value",
        "description": "Test description"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["key"] == "test_key"
    assert data["value"] == "test_value"

def test_update_setting(admin_client):
    # Create first
    admin_client.post("/api/admin/settings", json={
        "key": "update_key",
        "value": "original_value"
    })

    # Update
    response = admin_client.post("/api/admin/settings", json={
        "key": "update_key",
        "value": "new_value"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert "updated" in data["message"]

def test_get_setting_after_create(admin_client, client):
    admin_client.post("/api/admin/settings", json={
        "key": "fetch_key",
        "value": "fetch_value"
    })

    response = client.get("/api/admin/settings/fetch_key")
    assert response.status_code == 200
    data = response.json()
    assert data["key"] == "fetch_key"
    assert data["value"] == "fetch_value"

def test_create_youtube_url_setting(admin_client):
    response = admin_client.post("/api/admin/settings", json={
        "key": "youtube_url",
        "value": "https://www.youtube.com/watch?v=TestVideo123"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["key"] == "youtube_url"

def test_invalid_key_too_long(admin_client):
    long_key = "a" * 150
    response = admin_client.post("/api/admin/settings", json={
        "key": long_key,
        "value": "value"
    })
    assert response.status_code == 400


def test_delete_setting_success(admin_client, client):
    """Test successful deletion of a setting."""
    # Create first
    admin_client.post("/api/admin/settings", json={
        "key": "delete_me",
        "value": "will_be_deleted"
    })

    # Delete
    response = admin_client.delete("/api/admin/settings/delete_me")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert "deleted" in data["message"]

    # Verify deletion
    get_response = client.get("/api/admin/settings/delete_me")
    assert get_response.json()["value"] is None


def test_delete_setting_not_found(admin_client):
    """Test deletion of non-existent setting returns 404."""
    response = admin_client.delete("/api/admin/settings/nonexistent_key")
    assert response.status_code == 404
