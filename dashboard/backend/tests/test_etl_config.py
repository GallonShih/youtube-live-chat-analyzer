"""
Tests for ETL config module (ORM-based).
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
import os


class TestETLConfig:
    """Tests for ETLConfig class."""

    def setup_method(self):
        """Reset ETLConfig state before each test."""
        from app.etl.config import ETLConfig
        ETLConfig._cache = {}
        ETLConfig._cache_enabled = False

    @patch('app.etl.config.get_db_manager')
    def test_get_engine_returns_engine(self, mock_get_db_manager):
        """Test get_engine returns engine from DatabaseManager."""
        mock_manager = MagicMock()
        mock_engine = MagicMock()
        mock_manager.engine = mock_engine
        mock_get_db_manager.return_value = mock_manager

        from app.etl.config import ETLConfig

        engine = ETLConfig.get_engine()

        assert engine == mock_engine

    @patch('app.etl.config.get_db_manager')
    def test_get_engine_returns_none_on_error(self, mock_get_db_manager):
        """Test get_engine returns None when DatabaseManager fails."""
        mock_get_db_manager.side_effect = Exception("No DATABASE_URL")

        from app.etl.config import ETLConfig

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

    @patch('app.etl.config.get_db_manager')
    def test_get_from_database(self, mock_get_db_manager):
        """Test get reads from database via ORM."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session

        # Mock the ETLSetting query result
        mock_setting = MagicMock()
        mock_setting.value = '100'
        mock_setting.value_type = 'integer'
        mock_session.query.return_value.filter.return_value.first.return_value = mock_setting

        mock_get_db_manager.return_value = mock_manager

        from app.etl.config import ETLConfig

        result = ETLConfig.get('BATCH_SIZE', 50)

        assert result == 100
        mock_session.close.assert_called_once()

    @patch('app.etl.config.get_db_manager')
    def test_get_from_env_as_fallback(self, mock_get_db_manager):
        """Test get falls back to environment variable."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        # DB returns no result
        mock_session.query.return_value.filter.return_value.first.return_value = None
        mock_get_db_manager.return_value = mock_manager

        from app.etl.config import ETLConfig

        with patch.dict(os.environ, {'MY_SETTING': 'env_value'}):
            result = ETLConfig.get('MY_SETTING', 'default')

        assert result == 'env_value'

    @patch('app.etl.config.get_db_manager')
    def test_get_returns_default(self, mock_get_db_manager):
        """Test get returns default when no value found."""
        mock_get_db_manager.side_effect = Exception("No DB")

        from app.etl.config import ETLConfig

        with patch.dict(os.environ, {}, clear=True):
            result = ETLConfig.get('NONEXISTENT', 'default_value')

        assert result == 'default_value'

    @patch('app.etl.config.get_db_manager')
    def test_get_uses_cache_when_enabled(self, mock_get_db_manager):
        """Test get uses cache when enabled."""
        from app.etl.config import ETLConfig
        ETLConfig.enable_cache()
        ETLConfig._cache['CACHED_KEY'] = 'cached_value'

        result = ETLConfig.get('CACHED_KEY', 'default')

        assert result == 'cached_value'
        mock_get_db_manager.assert_not_called()

    @patch('app.etl.config.get_db_manager')
    def test_get_database_exception_fallback(self, mock_get_db_manager):
        """Test get handles database exceptions gracefully."""
        mock_get_db_manager.side_effect = Exception("DB Error")

        from app.etl.config import ETLConfig

        with patch.dict(os.environ, {'FALLBACK_KEY': 'fallback'}):
            result = ETLConfig.get('FALLBACK_KEY', 'default')

        assert result == 'fallback'

    @patch('app.etl.config.get_db_manager')
    def test_set_success(self, mock_get_db_manager):
        """Test set writes to database via ORM."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        from app.etl.config import ETLConfig

        result = ETLConfig.set('NEW_KEY', 'new_value', 'string')

        assert result is True
        mock_session.execute.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.etl.config.get_db_manager')
    def test_set_no_engine(self, mock_get_db_manager):
        """Test set returns False when database is unavailable."""
        mock_get_db_manager.side_effect = Exception("No DB")

        from app.etl.config import ETLConfig

        result = ETLConfig.set('KEY', 'value')

        assert result is False

    @patch('app.etl.config.get_db_manager')
    def test_set_database_exception(self, mock_get_db_manager):
        """Test set handles database exceptions."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_session.execute.side_effect = Exception("DB Error")
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        from app.etl.config import ETLConfig

        result = ETLConfig.set('KEY', 'value')

        assert result is False

    @patch('app.etl.config.get_db_manager')
    def test_set_updates_cache_when_enabled(self, mock_get_db_manager):
        """Test set updates cache when enabled."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

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
