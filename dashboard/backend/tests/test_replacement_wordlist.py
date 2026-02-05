"""Tests for replacement wordlist router."""
import pytest
from app.models import ReplacementWordlist


class TestListReplacementWordlists:
    """Tests for GET /api/replacement-wordlists endpoint."""

    def test_list_empty(self, client):
        """Test listing when no wordlists exist."""
        response = client.get("/api/replacement-wordlists")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_with_data(self, client, db):
        """Test listing existing wordlists."""
        wl1 = ReplacementWordlist(
            name="日常用",
            replacements=[{"source": "酥", "target": "方塊酥"}]
        )
        wl2 = ReplacementWordlist(
            name="工作用",
            replacements=[{"source": "大", "target": "大大"}]
        )
        db.add_all([wl1, wl2])
        db.flush()

        response = client.get("/api/replacement-wordlists")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        # Should be ordered by name
        assert data[0]["name"] == "工作用"
        assert data[1]["name"] == "日常用"


class TestGetReplacementWordlist:
    """Tests for GET /api/replacement-wordlists/{id} endpoint."""

    def test_get_existing(self, client, db):
        """Test getting an existing wordlist."""
        wl = ReplacementWordlist(
            name="測試",
            replacements=[{"source": "詞1", "target": "詞2"}]
        )
        db.add(wl)
        db.flush()

        response = client.get(f"/api/replacement-wordlists/{wl.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "測試"
        assert len(data["replacements"]) == 1
        assert data["replacements"][0]["source"] == "詞1"
        assert data["replacements"][0]["target"] == "詞2"

    def test_get_not_found(self, client):
        """Test getting a non-existent wordlist."""
        response = client.get("/api/replacement-wordlists/999")
        assert response.status_code == 404


class TestCreateReplacementWordlist:
    """Tests for POST /api/replacement-wordlists endpoint."""

    def test_create_success(self, admin_client):
        """Test creating a new wordlist."""
        response = admin_client.post(
            "/api/replacement-wordlists",
            json={
                "name": "新清單",
                "replacements": [
                    {"source": "詞A", "target": "詞B"},
                    {"source": "詞C", "target": "詞D"}
                ]
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "新清單"
        assert len(data["replacements"]) == 2
        assert "id" in data
        assert "created_at" in data

    def test_create_empty_replacements(self, admin_client):
        """Test creating a wordlist with empty replacements array."""
        response = admin_client.post(
            "/api/replacement-wordlists",
            json={"name": "空清單", "replacements": []}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["replacements"] == []

    def test_create_duplicate_name(self, admin_client, db):
        """Test creating a wordlist with duplicate name fails."""
        wl = ReplacementWordlist(name="已存在", replacements=[])
        db.add(wl)
        db.flush()

        response = admin_client.post(
            "/api/replacement-wordlists",
            json={"name": "已存在", "replacements": [{"source": "a", "target": "b"}]}
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_empty_name(self, admin_client):
        """Test creating a wordlist with empty name fails."""
        response = admin_client.post(
            "/api/replacement-wordlists",
            json={"name": "", "replacements": []}
        )
        assert response.status_code == 422  # Validation error

    def test_create_name_too_long(self, admin_client):
        """Test creating a wordlist with too long name fails."""
        response = admin_client.post(
            "/api/replacement-wordlists",
            json={"name": "x" * 101, "replacements": []}
        )
        assert response.status_code == 422  # Validation error


class TestUpdateReplacementWordlist:
    """Tests for PUT /api/replacement-wordlists/{id} endpoint."""

    def test_update_replacements(self, admin_client, db):
        """Test updating wordlist replacements."""
        wl = ReplacementWordlist(
            name="更新測試",
            replacements=[{"source": "舊詞", "target": "舊目標"}]
        )
        db.add(wl)
        db.flush()

        response = admin_client.put(
            f"/api/replacement-wordlists/{wl.id}",
            json={"replacements": [{"source": "新詞", "target": "新目標"}]}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["replacements"]) == 1
        assert data["replacements"][0]["source"] == "新詞"
        assert data["name"] == "更新測試"  # Name unchanged

    def test_update_name(self, admin_client, db):
        """Test updating wordlist name."""
        wl = ReplacementWordlist(name="舊名", replacements=[])
        db.add(wl)
        db.flush()

        response = admin_client.put(
            f"/api/replacement-wordlists/{wl.id}",
            json={"name": "新名"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "新名"

    def test_update_duplicate_name(self, admin_client, db):
        """Test updating to a duplicate name fails."""
        wl1 = ReplacementWordlist(name="清單1", replacements=[])
        wl2 = ReplacementWordlist(name="清單2", replacements=[])
        db.add_all([wl1, wl2])
        db.flush()

        response = admin_client.put(
            f"/api/replacement-wordlists/{wl2.id}",
            json={"name": "清單1"}
        )
        assert response.status_code == 400

    def test_update_not_found(self, admin_client):
        """Test updating a non-existent wordlist."""
        response = admin_client.put(
            "/api/replacement-wordlists/999",
            json={"replacements": [{"source": "a", "target": "b"}]}
        )
        assert response.status_code == 404


class TestDeleteReplacementWordlist:
    """Tests for DELETE /api/replacement-wordlists/{id} endpoint."""

    def test_delete_success(self, admin_client, db):
        """Test deleting a wordlist."""
        wl = ReplacementWordlist(
            name="待刪除",
            replacements=[{"source": "詞", "target": "替換"}]
        )
        db.add(wl)
        db.flush()
        wl_id = wl.id

        response = admin_client.delete(f"/api/replacement-wordlists/{wl_id}")
        assert response.status_code == 200
        assert response.json()["id"] == wl_id

        # Verify deletion
        assert db.query(ReplacementWordlist).filter(ReplacementWordlist.id == wl_id).first() is None

    def test_delete_not_found(self, admin_client):
        """Test deleting a non-existent wordlist."""
        response = admin_client.delete("/api/replacement-wordlists/999")
        assert response.status_code == 404
