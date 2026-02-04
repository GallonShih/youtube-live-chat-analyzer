"""
Tests for core database module.
"""

import pytest
from unittest.mock import MagicMock, patch
import os


class TestDatabaseManager:
    """Tests for DatabaseManager class."""

    @patch.dict(os.environ, {'DATABASE_URL': 'postgresql://test:test@localhost/test'})
    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_init_with_env_variable(self, mock_sessionmaker, mock_create_engine):
        """Test initialization with DATABASE_URL from environment."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager()
        
        assert manager.database_url == 'postgresql://test:test@localhost/test'
        mock_create_engine.assert_called_once()

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_init_with_explicit_url(self, mock_sessionmaker, mock_create_engine):
        """Test initialization with explicit database URL."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://explicit/db')
        
        assert manager.database_url == 'postgresql://explicit/db'

    @patch.dict(os.environ, {}, clear=True)
    def test_init_without_url_raises_error(self):
        """Test that missing DATABASE_URL raises ValueError."""
        # Clear any cached db_manager
        import app.core.database as db_module
        db_module.db_manager = None
        
        from app.core.database import DatabaseManager
        
        with pytest.raises(ValueError, match="DATABASE_URL"):
            DatabaseManager()

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_postgresql_engine_args(self, mock_sessionmaker, mock_create_engine):
        """Test PostgreSQL specific engine arguments."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://host/db')
        
        # Check that pool settings are applied for PostgreSQL
        call_kwargs = mock_create_engine.call_args[1]
        assert 'pool_size' in call_kwargs
        assert 'max_overflow' in call_kwargs
        assert 'pool_pre_ping' in call_kwargs

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_sqlite_engine_args(self, mock_sessionmaker, mock_create_engine):
        """Test SQLite does not get pool settings."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='sqlite:///test.db')
        
        # Check that pool settings are NOT applied for SQLite
        call_kwargs = mock_create_engine.call_args[1]
        assert 'pool_size' not in call_kwargs

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_create_tables(self, mock_sessionmaker, mock_create_engine):
        """Test create_tables method."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        from app.models import Base
        
        with patch.object(Base.metadata, 'create_all') as mock_create_all:
            manager = DatabaseManager(database_url='postgresql://host/db')
            manager.create_tables()
            
            mock_create_all.assert_called_once_with(bind=mock_engine)

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_create_tables_handles_error(self, mock_sessionmaker, mock_create_engine):
        """Test create_tables handles SQLAlchemy errors."""
        from sqlalchemy.exc import SQLAlchemyError
        
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        from app.models import Base
        
        with patch.object(Base.metadata, 'create_all', side_effect=SQLAlchemyError("Error")):
            manager = DatabaseManager(database_url='postgresql://host/db')
            
            with pytest.raises(SQLAlchemyError):
                manager.create_tables()

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_get_session(self, mock_sessionmaker, mock_create_engine):
        """Test get_session returns a session."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        mock_session = MagicMock()
        mock_sessionmaker.return_value = MagicMock(return_value=mock_session)
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://host/db')
        session = manager.get_session()
        
        assert session == mock_session

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_test_connection_success(self, mock_sessionmaker, mock_create_engine):
        """Test test_connection returns True on success."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://host/db')
        result = manager.test_connection()
        
        assert result is True
        mock_conn.execute.assert_called_once()

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_test_connection_failure(self, mock_sessionmaker, mock_create_engine):
        """Test test_connection returns False on failure."""
        from sqlalchemy.exc import SQLAlchemyError
        
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        mock_engine.connect.side_effect = SQLAlchemyError("Connection failed")
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://host/db')
        result = manager.test_connection()
        
        assert result is False

    @patch('app.core.database.create_engine')
    @patch('app.core.database.sessionmaker')
    def test_close(self, mock_sessionmaker, mock_create_engine):
        """Test close disposes engine."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.core.database import DatabaseManager
        manager = DatabaseManager(database_url='postgresql://host/db')
        manager.close()
        
        mock_engine.dispose.assert_called_once()


class TestDatabaseFunctions:
    """Tests for module-level database functions."""

    @patch('app.core.database.DatabaseManager')
    def test_get_db_manager_creates_singleton(self, mock_manager_class):
        """Test get_db_manager creates singleton instance."""
        import app.core.database as db_module
        db_module.db_manager = None  # Reset singleton
        
        mock_instance = MagicMock()
        mock_manager_class.return_value = mock_instance
        
        manager1 = db_module.get_db_manager()
        manager2 = db_module.get_db_manager()
        
        assert manager1 == manager2
        mock_manager_class.assert_called_once()

    @patch('app.core.database.get_db_manager')
    def test_get_db_session_context_manager(self, mock_get_manager):
        """Test get_db_session as context manager."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_get_manager.return_value = mock_manager
        mock_manager.get_session.return_value = mock_session
        
        from app.core.database import get_db_session
        
        with get_db_session() as session:
            assert session == mock_session
        
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.core.database.get_db_manager')
    def test_get_db_session_rollback_on_error(self, mock_get_manager):
        """Test get_db_session rolls back on error."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_get_manager.return_value = mock_manager
        mock_manager.get_session.return_value = mock_session
        
        from app.core.database import get_db_session
        
        with pytest.raises(ValueError):
            with get_db_session() as session:
                raise ValueError("Test error")
        
        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()
