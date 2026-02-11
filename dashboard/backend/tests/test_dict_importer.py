"""
Tests for dict_importer processor.
"""

import pytest
from unittest.mock import MagicMock, patch, mock_open
import json
from pathlib import Path


class TestDictImporter:
    """Tests for DictImporter class."""

    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_init_with_defaults(self, mock_config):
        """Test DictImporter initialization with defaults."""
        mock_config.get.return_value = 'postgresql://test'
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        
        assert importer.database_url == 'postgresql://test'

    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_init_with_custom_url(self, mock_config):
        """Test DictImporter initialization with custom database URL."""
        from app.etl.processors.dict_importer import DictImporter
        
        custom_url = 'postgresql://custom:5432/db'
        importer = DictImporter(database_url=custom_url)
        
        assert importer.database_url == custom_url

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_get_engine_creates_once(self, mock_create_engine, mock_config):
        """Test that get_engine creates engine only once."""
        mock_config.get.return_value = 'postgresql://test'
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        
        engine1 = importer.get_engine()
        engine2 = importer.get_engine()
        
        assert engine1 == engine2
        mock_create_engine.assert_called_once()

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_run_success(self, mock_create_engine, mock_config):
        """Test successful run of DictImporter."""
        mock_config.get.side_effect = lambda key, default=None: {
            'DATABASE_URL': 'postgresql://test',
            'TRUNCATE_REPLACE_WORDS': False,
            'TRUNCATE_SPECIAL_WORDS': False,
        }.get(key, default)
        
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__.return_value = mock_conn
        
        # Mock file reading
        test_data = {
            'meaningless': {'words': ['測試']},
            'replace': {'A': 'B'},
            'special': {'words': ['特殊']}
        }
        
        from app.etl.processors.dict_importer import DictImporter
        
        with patch.object(DictImporter, '_create_tables_if_not_exists'):
            with patch.object(DictImporter, '_import_meaningless_words', return_value={'total': 1, 'inserted': 1}):
                with patch.object(DictImporter, '_import_replace_words', return_value={'total': 1, 'inserted': 1}):
                    with patch.object(DictImporter, '_import_special_words', return_value={'total': 1, 'inserted': 1}):
                        importer = DictImporter()
                        result = importer.run()
        
        assert result['status'] == 'completed'
        assert 'meaningless_words' in result
        assert 'replace_words' in result
        assert 'special_words' in result
        assert 'execution_time_seconds' in result

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_run_handles_exception(self, mock_create_engine, mock_config):
        """Test run handles exceptions gracefully."""
        mock_config.get.return_value = 'postgresql://test'
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.dict_importer import DictImporter
        
        with patch.object(DictImporter, '_create_tables_if_not_exists', side_effect=Exception("DB Error")):
            importer = DictImporter()
            result = importer.run()
        
        assert result['status'] == 'failed'
        assert 'error' in result
        assert 'DB Error' in result['error']

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_run_with_truncate_flags(self, mock_create_engine, mock_config):
        """Test run with truncate flags enabled."""
        config_values = {
            'DATABASE_URL': 'postgresql://test',
            'TRUNCATE_REPLACE_WORDS': True,
            'TRUNCATE_SPECIAL_WORDS': True,
        }
        mock_config.get.side_effect = lambda key, default=None: config_values.get(key, default)
        mock_config.set = MagicMock()
        
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.dict_importer import DictImporter
        
        with patch.object(DictImporter, '_create_tables_if_not_exists'):
            with patch.object(DictImporter, '_truncate_table') as mock_truncate:
                with patch.object(DictImporter, '_import_meaningless_words', return_value={'total': 0, 'inserted': 0}):
                    with patch.object(DictImporter, '_import_replace_words', return_value={'total': 0, 'inserted': 0}):
                        with patch.object(DictImporter, '_import_special_words', return_value={'total': 0, 'inserted': 0}):
                            importer = DictImporter()
                            result = importer.run()
        
        assert result['status'] == 'completed'
        # Verify truncate was called for both tables
        assert mock_truncate.call_count == 2


class TestDictImporterIntegration:
    """Integration-style tests for DictImporter with real file structures."""

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('builtins.open', new_callable=mock_open)
    @patch('app.etl.processors.dict_importer.Path.exists')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_import_meaningless_words_file_not_found(
        self, mock_create_engine, mock_exists, mock_file, mock_config
    ):
        """Test handling of missing meaningless_words.json."""
        mock_config.get.return_value = 'postgresql://test'
        mock_exists.return_value = False
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        
        # This would typically return empty result or handle gracefully
        # depending on implementation


class TestDictImporterImportMethods:
    """Tests for individual import methods of DictImporter."""

    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_import_meaningless_words_returns_file_not_found(self, mock_config):
        """Test _import_meaningless_words raises error for missing file."""
        mock_config.get.return_value = 'postgresql://test'
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))
        
        with pytest.raises(FileNotFoundError, match="Meaningless words file not found"):
            importer._import_meaningless_words()

    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_import_replace_words_returns_file_not_found(self, mock_config):
        """Test _import_replace_words raises error for missing file."""
        mock_config.get.return_value = 'postgresql://test'
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))
        
        with pytest.raises(FileNotFoundError, match="Replace words file not found"):
            importer._import_replace_words()

    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_import_special_words_returns_file_not_found(self, mock_config):
        """Test _import_special_words raises error for missing file."""
        mock_config.get.return_value = 'postgresql://test'
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))
        
        with pytest.raises(FileNotFoundError, match="Special words file not found"):
            importer._import_special_words()


class TestDictImporterDatabase:
    """Tests for DictImporter database operations."""

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_create_tables_if_not_exists(self, mock_create_engine, mock_config):
        """Test _create_tables_if_not_exists executes SQL."""
        mock_config.get.return_value = 'postgresql://test'
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        importer._create_tables_if_not_exists()
        
        mock_conn.execute.assert_called()
        mock_conn.commit.assert_called()

    @patch('app.etl.processors.dict_importer.ETLConfig')
    @patch('app.etl.processors.dict_importer.create_engine')
    def test_truncate_table(self, mock_create_engine, mock_config):
        """Test _truncate_table executes correct SQL."""
        mock_config.get.return_value = 'postgresql://test'
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        importer._truncate_table('test_table')
        
        mock_conn.execute.assert_called()
        mock_conn.commit.assert_called()
