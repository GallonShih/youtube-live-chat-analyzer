"""Tests for authentication endpoints and protected routes."""
import pytest
from app.core.security import create_access_token, create_refresh_token


class TestAuthLogin:
    """Test cases for /api/auth/login endpoint."""

    def test_login_success(self, client):
        """Test successful login with correct password."""
        response = client.post(
            "/api/auth/login",
            json={"password": "admin123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client):
        """Test login fails with wrong password."""
        response = client.post(
            "/api/auth/login",
            json={"password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Incorrect password" in response.json()["detail"]

    def test_login_empty_password(self, client):
        """Test login fails with empty password."""
        response = client.post(
            "/api/auth/login",
            json={"password": ""}
        )
        assert response.status_code == 400
        assert "Password is required" in response.json()["detail"]


class TestAuthRefresh:
    """Test cases for /api/auth/refresh endpoint."""

    def test_refresh_token_success(self, client):
        """Test successful token refresh."""
        # First login to get tokens
        login_response = client.post(
            "/api/auth/login",
            json={"password": "admin123"}
        )
        refresh_token = login_response.json()["refresh_token"]

        # Refresh the access token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_token}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_refresh_with_invalid_token(self, client):
        """Test refresh fails with invalid token."""
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid.token.here"}
        )
        assert response.status_code == 401

    def test_refresh_with_access_token(self, client):
        """Test refresh fails when using access token instead of refresh token."""
        # Get an access token
        access_token = create_access_token({"role": "admin"})

        # Try to use access token as refresh token
        response = client.post(
            "/api/auth/refresh",
            json={"refresh_token": access_token}
        )
        assert response.status_code == 401
        assert "refresh token" in response.json()["detail"].lower()


class TestAuthMe:
    """Test cases for /api/auth/me endpoint."""

    def test_me_authenticated(self, client, admin_headers):
        """Test getting user info when authenticated."""
        response = client.get("/api/auth/me", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"

    def test_me_unauthenticated(self, client):
        """Test getting user info without authentication returns guest."""
        response = client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "guest"

    def test_me_invalid_token(self, client):
        """Test getting user info with invalid token returns guest."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "guest"


class TestProtectedEndpoints:
    """Test cases for protected API endpoints."""

    def test_protected_endpoint_without_auth(self, client, db):
        """Test accessing protected endpoint without auth returns 401."""
        # Try to create a word group without authentication
        response = client.post(
            "/api/word-trends/groups",
            json={"name": "Test Group", "words": ["test"]}
        )
        assert response.status_code == 401

    def test_protected_endpoint_with_auth(self, client, admin_headers, db):
        """Test accessing protected endpoint with auth succeeds."""
        response = client.post(
            "/api/word-trends/groups",
            json={"name": "Test Group", "words": ["test"]},
            headers=admin_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Group"

    def test_read_endpoint_without_auth(self, client, db):
        """Test GET endpoints don't require authentication."""
        # GET endpoints should be accessible without auth
        response = client.get("/api/word-trends/groups")
        assert response.status_code == 200

    def test_admin_settings_protected(self, client, db):
        """Test admin settings endpoints are protected."""
        response = client.post(
            "/api/admin/settings",
            json={"key": "test_key", "value": "test_value"}
        )
        assert response.status_code == 401

    def test_etl_trigger_protected(self, client, db):
        """Test ETL trigger endpoint is protected."""
        response = client.post("/api/admin/etl/jobs/import_dicts/trigger")
        assert response.status_code == 401

    def test_exclusion_wordlist_protected(self, client, db):
        """Test exclusion wordlist create is protected."""
        response = client.post(
            "/api/exclusion-wordlists",
            json={"name": "Test", "words": ["test"]}
        )
        assert response.status_code == 401

    def test_replacement_wordlist_protected(self, client, db):
        """Test replacement wordlist create is protected."""
        response = client.post(
            "/api/replacement-wordlists",
            json={"name": "Test", "replacements": []}
        )
        assert response.status_code == 401

    def test_prompt_template_protected(self, client, db):
        """Test prompt template create is protected."""
        response = client.post(
            "/api/admin/etl/prompt-templates",
            json={"name": "Test", "template": "test template"}
        )
        assert response.status_code == 401
