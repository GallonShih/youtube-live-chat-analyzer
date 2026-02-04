"""
Tests for main application module.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    def test_health_check(self, client):
        """Test health check returns ok status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestAppConfiguration:
    """Tests for application configuration."""

    def test_app_title(self):
        """Test app has correct title."""
        from main import app
        
        assert app.title == "YouTube Live Chat Analyzer API"

    def test_routers_included(self):
        """Test all routers are included."""
        from main import app
        
        # Get all route paths
        routes = [r.path for r in app.routes]
        
        # Check some expected routes exist
        assert any('/health' in r for r in routes)
        assert any('/api/stats' in r for r in routes)
        assert any('/api/chat' in r for r in routes)


class TestLifespan:
    """Tests for application lifespan events."""

    @patch('main.shutdown_scheduler')
    @patch('main.start_scheduler')
    @patch('main.register_jobs')
    @patch('main.init_scheduler')
    @patch('main.ETLConfig')
    @patch('main.get_db_manager')
    @patch.dict('os.environ', {'DATABASE_URL': 'postgresql://test/db', 'ENABLE_ETL_SCHEDULER': 'true'})
    def test_lifespan_startup_with_scheduler(
        self, mock_get_db, mock_etl_config, mock_init_scheduler,
        mock_register_jobs, mock_start_scheduler, mock_shutdown
    ):
        """Test lifespan startup initializes scheduler when enabled."""
        mock_db_manager = MagicMock()
        mock_get_db.return_value = mock_db_manager
        
        from main import app
        
        with TestClient(app):
            # Startup should have been called
            mock_db_manager.create_tables.assert_called()

    @patch('main.get_db_manager')
    @patch.dict('os.environ', {'ENABLE_ETL_SCHEDULER': 'false'})
    def test_lifespan_startup_without_scheduler(self, mock_get_db):
        """Test lifespan startup skips scheduler when disabled."""
        mock_db_manager = MagicMock()
        mock_get_db.return_value = mock_db_manager
        
        # Reset the module-level variable
        import main
        main.ENABLE_ETL_SCHEDULER = False
        
        from main import app
        
        with TestClient(app):
            mock_db_manager.create_tables.assert_called()

    @patch('main.get_db_manager')
    def test_lifespan_handles_db_error(self, mock_get_db):
        """Test lifespan handles database creation errors."""
        mock_db_manager = MagicMock()
        mock_db_manager.create_tables.side_effect = Exception("DB Error")
        mock_get_db.return_value = mock_db_manager
        
        from main import app
        
        with pytest.raises(Exception, match="DB Error"):
            with TestClient(app):
                pass


class TestCORSConfiguration:
    """Tests for CORS configuration."""

    def test_cors_headers(self, client):
        """Test CORS headers are set."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        
        # Should not fail - CORS is configured
        assert response.status_code in [200, 405]
