"""Tests for exclusion wordlist router."""
import pytest
from app.models import ExclusionWordlist


class TestListWordlists:
    """Tests for GET /api/exclusion-wordlists endpoint."""

    def test_list_empty(self, client):
        """Test listing when no wordlists exist."""
        response = client.get("/api/exclusion-wordlists")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_with_data(self, client, db):
        """Test listing existing wordlists."""
        # Create test data
        wl1 = ExclusionWordlist(name="日常用", words=["哈哈", "好"])
        wl2 = ExclusionWordlist(name="工作用", words=["開會", "報告"])
        db.add_all([wl1, wl2])
        db.flush()

        response = client.get("/api/exclusion-wordlists")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Should be ordered by name
        assert data[0]["name"] == "工作用"
        assert data[1]["name"] == "日常用"


class TestGetWordlist:
    """Tests for GET /api/exclusion-wordlists/{id} endpoint."""

    def test_get_existing(self, client, db):
        """Test getting an existing wordlist."""
        wl = ExclusionWordlist(name="測試", words=["詞1", "詞2"])
        db.add(wl)
        db.flush()

        response = client.get(f"/api/exclusion-wordlists/{wl.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "測試"
        assert data["words"] == ["詞1", "詞2"]

    def test_get_not_found(self, client):
        """Test getting a non-existent wordlist."""
        response = client.get("/api/exclusion-wordlists/999")
        assert response.status_code == 404


class TestCreateWordlist:
    """Tests for POST /api/exclusion-wordlists endpoint."""

    def test_create_success(self, admin_client):
        """Test creating a new wordlist."""
        response = admin_client.post(
            "/api/exclusion-wordlists",
            json={"name": "新清單", "words": ["詞A", "詞B"]}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "新清單"
        assert data["words"] == ["詞A", "詞B"]
        assert "id" in data
        assert "created_at" in data

    def test_create_empty_words(self, admin_client):
        """Test creating a wordlist with empty words array."""
        response = admin_client.post(
            "/api/exclusion-wordlists",
            json={"name": "空清單", "words": []}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["words"] == []

    def test_create_duplicate_name(self, admin_client, db):
        """Test creating a wordlist with duplicate name fails."""
        wl = ExclusionWordlist(name="已存在", words=[])
        db.add(wl)
        db.flush()

        response = admin_client.post(
            "/api/exclusion-wordlists",
            json={"name": "已存在", "words": ["新詞"]}
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_empty_name(self, admin_client):
        """Test creating a wordlist with empty name fails."""
        response = admin_client.post(
            "/api/exclusion-wordlists",
            json={"name": "", "words": ["詞"]}
        )
        assert response.status_code == 422  # Validation error

    def test_create_name_too_long(self, admin_client):
        """Test creating a wordlist with too long name fails."""
        response = admin_client.post(
            "/api/exclusion-wordlists",
            json={"name": "x" * 101, "words": []}
        )
        assert response.status_code == 422  # Validation error


class TestUpdateWordlist:
    """Tests for PUT /api/exclusion-wordlists/{id} endpoint."""

    def test_update_words(self, admin_client, db):
        """Test updating wordlist words."""
        wl = ExclusionWordlist(name="更新測試", words=["舊詞"])
        db.add(wl)
        db.flush()

        response = admin_client.put(
            f"/api/exclusion-wordlists/{wl.id}",
            json={"words": ["新詞1", "新詞2"]}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["words"] == ["新詞1", "新詞2"]
        assert data["name"] == "更新測試"  # Name unchanged

    def test_update_name(self, admin_client, db):
        """Test updating wordlist name."""
        wl = ExclusionWordlist(name="舊名", words=["詞"])
        db.add(wl)
        db.flush()

        response = admin_client.put(
            f"/api/exclusion-wordlists/{wl.id}",
            json={"name": "新名"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "新名"

    def test_update_duplicate_name(self, admin_client, db):
        """Test updating to a duplicate name fails."""
        wl1 = ExclusionWordlist(name="清單1", words=[])
        wl2 = ExclusionWordlist(name="清單2", words=[])
        db.add_all([wl1, wl2])
        db.flush()

        response = admin_client.put(
            f"/api/exclusion-wordlists/{wl2.id}",
            json={"name": "清單1"}
        )
        assert response.status_code == 400

    def test_update_not_found(self, admin_client):
        """Test updating a non-existent wordlist."""
        response = admin_client.put(
            "/api/exclusion-wordlists/999",
            json={"words": ["詞"]}
        )
        assert response.status_code == 404


class TestDeleteWordlist:
    """Tests for DELETE /api/exclusion-wordlists/{id} endpoint."""

    def test_delete_success(self, admin_client, db):
        """Test deleting a wordlist."""
        wl = ExclusionWordlist(name="待刪除", words=["詞"])
        db.add(wl)
        db.flush()
        wl_id = wl.id

        response = admin_client.delete(f"/api/exclusion-wordlists/{wl_id}")
        assert response.status_code == 200
        assert response.json()["id"] == wl_id

        # Verify deletion
        assert db.query(ExclusionWordlist).filter(ExclusionWordlist.id == wl_id).first() is None

    def test_delete_not_found(self, admin_client):
        """Test deleting a non-existent wordlist."""
        response = admin_client.delete("/api/exclusion-wordlists/999")
        assert response.status_code == 404
