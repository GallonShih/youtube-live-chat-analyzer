"""
Tests for ETL config module.
"""

import pytest
from unittest.mock import MagicMock, patch
import os


class TestETLConfig:
    """Tests for ETLConfig class."""

    def setup_method(self):
        """Reset ETLConfig state before each test."""
        from app.etl.config import ETLConfig
        ETLConfig._engine = None
        ETLConfig._cache = {}
        ETLConfig._cache_enabled = False

    @patch('app.etl.config.create_engine')
    def test_init_engine(self, mock_create_engine):
        """Test engine initialization."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.config import ETLConfig
        ETLConfig.init_engine('postgresql://test/db')
        
        assert ETLConfig._engine == mock_engine
        mock_create_engine.assert_called_once()

    @patch('app.etl.config.create_engine')
    def test_get_engine_creates_from_env(self, mock_create_engine):
        """Test get_engine creates from DATABASE_URL env var."""
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.config import ETLConfig
        
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://env/db'}):
            engine = ETLConfig.get_engine()
        
        assert engine == mock_engine

    def test_get_engine_returns_none_without_url(self):
        """Test get_engine returns None without DATABASE_URL."""
        from app.etl.config import ETLConfig
        
        with patch.dict(os.environ, {}, clear=True):
            # Also need to clear any existing engine
            ETLConfig._engine = None
            engine = ETLConfig.get_engine()
        
        assert engine is None

    def test_clear_cache(self):
        """Test clear_cache empties the cache."""
        from app.etl.config import ETLConfig
        ETLConfig._cache = {'key': 'value'}
        
        ETLConfig.clear_cache()
        
        assert ETLConfig._cache == {}

    def test_enable_disable_cache(self):
        """Test cache enable/disable."""
        from app.etl.config import ETLConfig
        
        ETLConfig.enable_cache()
        assert ETLConfig._cache_enabled is True
        
        ETLConfig.disable_cache()
        assert ETLConfig._cache_enabled is False
        assert ETLConfig._cache == {}

    @patch.dict(os.environ, {'GEMINI_API_KEY': 'test-api-key'})
    def test_get_sensitive_key_from_env(self):
        """Test sensitive keys are read from environment first."""
        from app.etl.config import ETLConfig
        
        result = ETLConfig.get('GEMINI_API_KEY', 'default')
        
        assert result == 'test-api-key'

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_get_from_database(self, mock_get_engine):
        """Test get reads from database."""
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_conn.execute.return_value.fetchone.return_value = ('100', 'integer')
        
        from app.etl.config import ETLConfig
        
        result = ETLConfig.get('BATCH_SIZE', 50)
        
        assert result == 100

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_get_from_env_as_fallback(self, mock_get_engine):
        """Test get falls back to environment variable."""
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        mock_conn.execute.return_value.fetchone.return_value = None
        
        from app.etl.config import ETLConfig
        
        with patch.dict(os.environ, {'MY_SETTING': 'env_value'}):
            result = ETLConfig.get('MY_SETTING', 'default')
        
        assert result == 'env_value'

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_get_returns_default(self, mock_get_engine):
        """Test get returns default when no value found."""
        mock_get_engine.return_value = None
        
        from app.etl.config import ETLConfig
        
        with patch.dict(os.environ, {}, clear=True):
            result = ETLConfig.get('NONEXISTENT', 'default_value')
        
        assert result == 'default_value'

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_get_uses_cache_when_enabled(self, mock_get_engine):
        """Test get uses cache when enabled."""
        from app.etl.config import ETLConfig
        ETLConfig.enable_cache()
        ETLConfig._cache['CACHED_KEY'] = 'cached_value'
        
        result = ETLConfig.get('CACHED_KEY', 'default')
        
        assert result == 'cached_value'
        mock_get_engine.assert_not_called()

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_get_database_exception_fallback(self, mock_get_engine):
        """Test get handles database exceptions gracefully."""
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.side_effect = Exception("DB Error")
        
        from app.etl.config import ETLConfig
        
        with patch.dict(os.environ, {'FALLBACK_KEY': 'fallback'}):
            result = ETLConfig.get('FALLBACK_KEY', 'default')
        
        assert result == 'fallback'

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_set_success(self, mock_get_engine):
        """Test set writes to database."""
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        
        from app.etl.config import ETLConfig
        
        result = ETLConfig.set('NEW_KEY', 'new_value', 'string')
        
        assert result is True
        mock_conn.execute.assert_called_once()
        mock_conn.commit.assert_called_once()

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_set_no_engine(self, mock_get_engine):
        """Test set returns False when no engine."""
        mock_get_engine.return_value = None
        
        from app.etl.config import ETLConfig
        
        result = ETLConfig.set('KEY', 'value')
        
        assert result is False

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_set_database_exception(self, mock_get_engine):
        """Test set handles database exceptions."""
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.side_effect = Exception("DB Error")
        
        from app.etl.config import ETLConfig
        
        result = ETLConfig.set('KEY', 'value')
        
        assert result is False

    @patch('app.etl.config.ETLConfig.get_engine')
    def test_set_updates_cache_when_enabled(self, mock_get_engine):
        """Test set updates cache when enabled."""
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        
        from app.etl.config import ETLConfig
        ETLConfig.enable_cache()
        
        ETLConfig.set('CACHED', 'cached_value')
        
        assert ETLConfig._cache.get('CACHED') == 'cached_value'


class TestETLConfigTypeConversion:
    """Tests for ETLConfig type conversion."""

    def test_convert_boolean_true(self):
        """Test boolean conversion for true values."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type('true', 'boolean') is True
        assert ETLConfig._convert_type('1', 'boolean') is True
        assert ETLConfig._convert_type('yes', 'boolean') is True
        assert ETLConfig._convert_type('TRUE', 'boolean') is True

    def test_convert_boolean_false(self):
        """Test boolean conversion for false values."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type('false', 'boolean') is False
        assert ETLConfig._convert_type('0', 'boolean') is False
        assert ETLConfig._convert_type('no', 'boolean') is False

    def test_convert_integer(self):
        """Test integer conversion."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type('42', 'integer') == 42
        assert ETLConfig._convert_type('-10', 'integer') == -10

    def test_convert_float(self):
        """Test float conversion."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type('3.14', 'float') == 3.14
        assert ETLConfig._convert_type('-2.5', 'float') == -2.5

    def test_convert_datetime(self):
        """Test datetime conversion."""
        from app.etl.config import ETLConfig
        from datetime import datetime
        
        result = ETLConfig._convert_type('2026-01-15T10:30:00', 'datetime')
        
        assert isinstance(result, datetime)
        assert result.year == 2026
        assert result.month == 1

    def test_convert_string(self):
        """Test string passthrough."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type('hello', 'string') == 'hello'

    def test_convert_none(self):
        """Test None handling."""
        from app.etl.config import ETLConfig
        
        assert ETLConfig._convert_type(None, 'integer') is None

    def test_convert_invalid_integer(self):
        """Test invalid integer conversion returns original value."""
        from app.etl.config import ETLConfig
        
        result = ETLConfig._convert_type('not_a_number', 'integer')
        
        assert result == 'not_a_number'

    def test_convert_invalid_datetime(self):
        """Test invalid datetime conversion returns original value."""
        from app.etl.config import ETLConfig
        
        result = ETLConfig._convert_type('invalid-date', 'datetime')
        
        assert result == 'invalid-date'
