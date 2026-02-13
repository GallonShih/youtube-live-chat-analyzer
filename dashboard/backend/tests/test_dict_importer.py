"""
Tests for dict_importer processor (ORM-based).
"""

import pytest
from unittest.mock import MagicMock, patch, mock_open
import json
from pathlib import Path


class TestDictImporter:
    """Tests for DictImporter class."""

    @patch('app.etl.processors.base.get_db_manager')
    def test_init_with_defaults(self, mock_get_db_manager):
        """Test DictImporter initialization with defaults."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()

        assert importer.db_manager is not None
        assert importer.text_analysis_dir is not None

    @patch('app.etl.processors.base.get_db_manager')
    def test_init_with_custom_dir(self, mock_get_db_manager):
        """Test DictImporter initialization with custom directory."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter

        custom_dir = Path('/custom/path')
        importer = DictImporter(text_analysis_dir=custom_dir)

        assert importer.text_analysis_dir == custom_dir

    @patch('app.etl.processors.base.get_db_manager')
    def test_uses_shared_db_manager(self, mock_get_db_manager):
        """Test that DictImporter uses shared DatabaseManager."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()

        assert importer.db_manager == mock_manager

    @patch('app.etl.processors.base.get_db_manager')
    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_run_success(self, mock_config, mock_get_db_manager):
        """Test successful run of DictImporter."""
        mock_get_db_manager.return_value = MagicMock()
        mock_config.get.side_effect = lambda key, default=None: {
            'TRUNCATE_REPLACE_WORDS': False,
            'TRUNCATE_SPECIAL_WORDS': False,
        }.get(key, default)

        from app.etl.processors.dict_importer import DictImporter

        with patch.object(DictImporter, '_import_meaningless_words', return_value={'total': 1, 'processed': 1}):
            with patch.object(DictImporter, '_import_replace_words', return_value={'total': 1, 'processed': 1}):
                with patch.object(DictImporter, '_import_special_words', return_value={'total': 1, 'processed': 1}):
                    importer = DictImporter()
                    result = importer.run()

        assert result['status'] == 'completed'
        assert 'meaningless_words' in result
        assert 'replace_words' in result
        assert 'special_words' in result
        assert 'execution_time_seconds' in result

    @patch('app.etl.processors.base.get_db_manager')
    def test_run_handles_exception(self, mock_get_db_manager):
        """Test run handles exceptions gracefully."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter

        with patch.object(DictImporter, '_import_meaningless_words', side_effect=Exception("DB Error")):
            importer = DictImporter()
            result = importer.run()

        assert result['status'] == 'failed'
        assert 'error' in result
        assert 'DB Error' in result['error']

    @patch('app.etl.processors.base.get_db_manager')
    @patch('app.etl.processors.dict_importer.ETLConfig')
    def test_run_with_truncate_flags(self, mock_config, mock_get_db_manager):
        """Test run with truncate flags enabled."""
        mock_get_db_manager.return_value = MagicMock()
        config_values = {
            'TRUNCATE_REPLACE_WORDS': True,
            'TRUNCATE_SPECIAL_WORDS': True,
        }
        mock_config.get.side_effect = lambda key, default=None: config_values.get(key, default)
        mock_config.set = MagicMock()

        from app.etl.processors.dict_importer import DictImporter

        with patch.object(DictImporter, '_truncate_model') as mock_truncate:
            with patch.object(DictImporter, '_import_meaningless_words', return_value={'total': 0, 'processed': 0}):
                with patch.object(DictImporter, '_import_replace_words', return_value={'total': 0, 'processed': 0}):
                    with patch.object(DictImporter, '_import_special_words', return_value={'total': 0, 'processed': 0}):
                        importer = DictImporter()
                        result = importer.run()

        assert result['status'] == 'completed'
        # Verify truncate was called for both tables
        assert mock_truncate.call_count == 2


class TestDictImporterImportMethods:
    """Tests for individual import methods of DictImporter."""

    @patch('app.etl.processors.base.get_db_manager')
    def test_import_meaningless_words_returns_file_not_found(self, mock_get_db_manager):
        """Test _import_meaningless_words raises error for missing file."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))

        with pytest.raises(FileNotFoundError, match="Meaningless words file not found"):
            importer._import_meaningless_words()

    @patch('app.etl.processors.base.get_db_manager')
    def test_import_replace_words_returns_file_not_found(self, mock_get_db_manager):
        """Test _import_replace_words raises error for missing file."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))

        with pytest.raises(FileNotFoundError, match="Replace words file not found"):
            importer._import_replace_words()

    @patch('app.etl.processors.base.get_db_manager')
    def test_import_special_words_returns_file_not_found(self, mock_get_db_manager):
        """Test _import_special_words raises error for missing file."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter(text_analysis_dir=Path('/nonexistent'))

        with pytest.raises(FileNotFoundError, match="Special words file not found"):
            importer._import_special_words()


class TestDictImporterDatabase:
    """Tests for DictImporter database operations."""

    @patch('app.etl.processors.base.get_db_manager')
    def test_truncate_model_calls_delete(self, mock_get_db_manager):
        """Test _truncate_model uses ORM delete."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()
        importer._truncate_model('replace_words')

        mock_session.query.assert_called()
        mock_session.commit.assert_called()
        mock_session.close.assert_called()

    @patch('app.etl.processors.base.get_db_manager')
    def test_truncate_model_unknown_table(self, mock_get_db_manager):
        """Test _truncate_model with unknown table name."""
        mock_get_db_manager.return_value = MagicMock()

        from app.etl.processors.dict_importer import DictImporter
        importer = DictImporter()

        # Should not raise, just log warning
        importer._truncate_model('unknown_table')
