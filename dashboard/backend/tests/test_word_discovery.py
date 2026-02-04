"""
Tests for word_discovery processor logic.
"""

import pytest
from unittest.mock import MagicMock, patch
from app.etl.processors.word_discovery import filter_and_validate_words, WordDiscoveryProcessor


class TestFilterAndValidateWords:
    """Tests for filter_and_validate_words function."""

    def test_basic_replace_word_pass_through(self):
        """Test that basic replace words pass through unchanged."""
        gemini_replace = [
            {'source': '錯字', 'target': '正字', 'confidence': 0.9}
        ]
        gemini_special = []
        existing_replace = {}
        existing_special = set()

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        assert len(filtered_replace) == 1
        assert filtered_replace[0]['source'] == '錯字'
        assert filtered_replace[0]['target'] == '正字'
        # Target should be auto-added to special words
        assert len(filtered_special) == 1
        assert filtered_special[0]['word'] == '正字'

    def test_skip_same_source_target(self):
        """Test that words with same source and target are skipped."""
        gemini_replace = [
            {'source': '同字', 'target': '同字', 'confidence': 0.9}
        ]
        gemini_special = []

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, {}, set()
        )

        assert len(filtered_replace) == 0

    def test_protected_word_swap(self):
        """Test that protected words (targets/special) cause swap."""
        gemini_replace = [
            {'source': '特殊詞', 'target': '錯字', 'confidence': 0.9}
        ]
        gemini_special = []
        existing_replace = {}
        existing_special = {'特殊詞'}  # 特殊詞 is protected

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        # Should swap: 錯字 -> 特殊詞
        assert len(filtered_replace) == 1
        assert filtered_replace[0]['source'] == '錯字'
        assert filtered_replace[0]['target'] == '特殊詞'
        assert '_transformation' in filtered_replace[0]

    def test_source_exists_transformation(self):
        """Test source transformation when it already exists in DB."""
        gemini_replace = [
            {'source': 'A', 'target': 'C', 'confidence': 0.9}
        ]
        gemini_special = []
        existing_replace = {'A': 'B'}  # DB already has A->B
        existing_special = set()

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        # Should transform: A->C => C->B
        assert len(filtered_replace) == 1
        assert filtered_replace[0]['source'] == 'C'
        assert filtered_replace[0]['target'] == 'B'

    def test_skip_duplicate_source_after_transformation(self):
        """Test skipping when transformed source already exists."""
        gemini_replace = [
            {'source': 'A', 'target': 'C', 'confidence': 0.9}
        ]
        gemini_special = []
        existing_replace = {'A': 'B', 'C': 'D'}  # C already exists
        existing_special = set()

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        # After transform A->C => C->B, but C already exists as source
        assert len(filtered_replace) == 0

    def test_special_word_skip_existing(self):
        """Test that existing special words are skipped."""
        gemini_replace = []
        gemini_special = [
            {'word': '已存在', 'type': 'meme', 'confidence': 0.9}
        ]
        existing_special = {'已存在'}

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, {}, existing_special
        )

        assert len(filtered_special) == 0

    def test_special_word_pass_through(self):
        """Test that new special words pass through."""
        gemini_replace = []
        gemini_special = [
            {'word': '新梗', 'type': 'meme', 'confidence': 0.9}
        ]

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, {}, set()
        )

        assert len(filtered_special) == 1
        assert filtered_special[0]['word'] == '新梗'

    def test_auto_add_target_to_special(self):
        """Test that replace targets are auto-added to special words."""
        gemini_replace = [
            {'source': '錯字1', 'target': '正字1', 'confidence': 0.9},
            {'source': '錯字2', 'target': '正字2', 'confidence': 0.9},
        ]
        gemini_special = []

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, {}, set()
        )

        assert len(filtered_replace) == 2
        # Both targets should be auto-added
        assert len(filtered_special) == 2
        special_words = {s['word'] for s in filtered_special}
        assert '正字1' in special_words
        assert '正字2' in special_words

    def test_no_duplicate_auto_add_special(self):
        """Test that targets are not added if already in special words."""
        gemini_replace = [
            {'source': '錯字', 'target': '正字', 'confidence': 0.9}
        ]
        gemini_special = []
        existing_special = {'正字'}  # Already exists

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, {}, existing_special
        )

        # Replace should still pass (with swap)
        # But no new special words since target exists
        auto_added = [s for s in filtered_special if s.get('_auto_added')]
        assert len(auto_added) == 0

    def test_complex_scenario(self):
        """Test complex scenario with multiple rules applied."""
        gemini_replace = [
            {'source': 'A', 'target': 'B', 'confidence': 0.9},  # Normal
            {'source': 'C', 'target': 'C', 'confidence': 0.9},  # Skip: same
            {'source': 'D', 'target': 'E', 'confidence': 0.9},  # D is protected, swap
        ]
        gemini_special = [
            {'word': 'F', 'type': 'meme', 'confidence': 0.9},   # New
            {'word': 'G', 'type': 'meme', 'confidence': 0.9},   # Existing, skip
        ]
        existing_replace = {}
        existing_special = {'D', 'G'}  # D and G are protected/existing

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, gemini_special, existing_replace, existing_special
        )

        # A->B passes, C->C skipped, D->E swapped to E->D
        assert len(filtered_replace) == 2
        
        sources = {r['source'] for r in filtered_replace}
        assert 'A' in sources
        assert 'E' in sources  # Swapped from D->E

        # F is new, G is skipped, plus auto-added targets (B, D)
        special_words = {s['word'] for s in filtered_special}
        assert 'F' in special_words
        assert 'G' not in special_words
        assert 'B' in special_words  # Auto-added from A->B

    def test_empty_inputs(self):
        """Test with empty inputs."""
        filtered_replace, filtered_special = filter_and_validate_words(
            [], [], {}, set()
        )

        assert filtered_replace == []
        assert filtered_special == []

    def test_target_is_replace_target_protected(self):
        """Test that replace targets are also protected."""
        gemini_replace = [
            {'source': '目標詞', 'target': '新詞', 'confidence': 0.9}
        ]
        existing_replace = {'某字': '目標詞'}  # 目標詞 is a target
        existing_special = set()

        filtered_replace, filtered_special = filter_and_validate_words(
            gemini_replace, [], 
            existing_replace, 
            existing_special
        )

        # 目標詞 is protected (it's a target), should swap
        assert len(filtered_replace) == 1
        assert filtered_replace[0]['source'] == '新詞'
        assert filtered_replace[0]['target'] == '目標詞'


class TestWordDiscoveryProcessor:
    """Tests for WordDiscoveryProcessor class."""

    @patch('app.etl.processors.word_discovery.ETLConfig')
    def test_init_with_defaults(self, mock_config):
        """Test initialization with default values."""
        mock_config.get.return_value = 'postgresql://test/db'
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor()
        
        assert processor.database_url == 'postgresql://test/db'
        assert processor._engine is None
        assert processor.etl_log_id is None

    @patch('app.etl.processors.word_discovery.ETLConfig')
    def test_init_with_custom_values(self, mock_config):
        """Test initialization with custom values."""
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor(
            database_url='postgresql://custom/db',
            etl_log_id=123
        )
        
        assert processor.database_url == 'postgresql://custom/db'
        assert processor.etl_log_id == 123

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.word_discovery.create_engine')
    def test_get_engine_creates_new(self, mock_create_engine, mock_config):
        """Test get_engine creates engine when not cached."""
        mock_config.get.return_value = 'postgresql://test/db'
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor()
        engine = processor.get_engine()
        
        assert engine == mock_engine
        mock_create_engine.assert_called_once()

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.word_discovery.create_engine')
    def test_get_engine_returns_cached(self, mock_create_engine, mock_config):
        """Test get_engine returns cached engine."""
        mock_config.get.return_value = 'postgresql://test/db'
        mock_engine = MagicMock()
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor()
        engine1 = processor.get_engine()
        engine2 = processor.get_engine()
        
        assert engine1 == engine2
        assert mock_create_engine.call_count == 1

    @patch('app.etl.processors.word_discovery.ETLConfig')
    def test_run_returns_skipped_when_disabled(self, mock_config):
        """Test run returns skipped when word discovery is disabled."""
        mock_config.get.side_effect = lambda key, default=None: {
            'DATABASE_URL': 'postgresql://test/db',
            'DISCOVER_NEW_WORDS_ENABLED': False,
        }.get(key, default)
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor()
        result = processor.run()
        
        assert result['status'] == 'skipped'
        assert result['reason'] == 'disabled'

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch.object(WordDiscoveryProcessor, 'get_engine')
    @patch.object(WordDiscoveryProcessor, '_create_tables_if_not_exists')
    @patch.object(WordDiscoveryProcessor, '_initialize_analysis')
    @patch.object(WordDiscoveryProcessor, '_fetch_new_messages_info')
    def test_run_no_messages(
        self, mock_fetch, mock_init, mock_create, mock_engine, mock_config
    ):
        """Test run when there are no new messages."""
        mock_config.get.side_effect = lambda key, default=None: {
            'DATABASE_URL': 'postgresql://test/db',
            'DISCOVER_NEW_WORDS_ENABLED': True,
        }.get(key, default)
        mock_init.return_value = 1
        mock_fetch.return_value = (None, 0)
        
        mock_conn = MagicMock()
        mock_engine_obj = MagicMock()
        mock_engine_obj.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine_obj.connect.return_value.__exit__ = MagicMock(return_value=False)
        mock_engine.return_value = mock_engine_obj
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        with patch.object(WordDiscoveryProcessor, '_finalize_analysis'):
            processor = WordDiscoveryProcessor()
            result = processor.run()
        
        assert result['status'] == 'completed'
        assert result['messages_analyzed'] == 0

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch.object(WordDiscoveryProcessor, '_create_tables_if_not_exists')
    def test_run_handles_exception(self, mock_create, mock_config):
        """Test run handles exceptions gracefully."""
        mock_config.get.side_effect = lambda key, default=None: {
            'DATABASE_URL': 'postgresql://test/db',
            'DISCOVER_NEW_WORDS_ENABLED': True,
        }.get(key, default)
        mock_create.side_effect = Exception("DB Error")
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        
        with patch.object(WordDiscoveryProcessor, 'get_engine') as mock_engine:
            mock_conn = MagicMock()
            mock_engine_obj = MagicMock()
            mock_engine_obj.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
            mock_engine_obj.connect.return_value.__exit__ = MagicMock(return_value=False)
            mock_engine.return_value = mock_engine_obj
            
            processor = WordDiscoveryProcessor()
            result = processor.run()
        
        assert result['status'] == 'failed'
        assert 'DB Error' in result['error']

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.word_discovery.create_engine')
    def test_create_tables_if_not_exists(self, mock_create_engine, mock_config):
        """Test _create_tables_if_not_exists executes SQL."""
        mock_config.get.return_value = 'postgresql://test/db'
        mock_engine = MagicMock()
        mock_conn = MagicMock()
        mock_engine.connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_engine.connect.return_value.__exit__ = MagicMock(return_value=False)
        mock_create_engine.return_value = mock_engine
        
        from app.etl.processors.word_discovery import WordDiscoveryProcessor
        processor = WordDiscoveryProcessor()
        processor._create_tables_if_not_exists()
        
        mock_conn.execute.assert_called()
        mock_conn.commit.assert_called()
