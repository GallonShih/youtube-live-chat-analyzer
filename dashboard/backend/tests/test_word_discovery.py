"""
Tests for word_discovery processor logic (ORM-based).
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
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
    """Tests for WordDiscoveryProcessor class (ORM-based)."""

    @patch('app.etl.processors.base.get_db_manager')
    def test_init_with_defaults(self, mock_get_db_manager):
        """Test initialization with default values (inherits BaseETLProcessor)."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        processor = WordDiscoveryProcessor()

        assert processor.db_manager == mock_manager
        assert processor.etl_log_id is None

    @patch('app.etl.processors.base.get_db_manager')
    def test_init_with_etl_log_id(self, mock_get_db_manager):
        """Test initialization with etl_log_id."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        processor = WordDiscoveryProcessor(etl_log_id=123)

        assert processor.etl_log_id == 123

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.base.get_db_manager')
    def test_run_returns_skipped_when_disabled(self, mock_get_db_manager, mock_config):
        """Test run returns skipped when word discovery is disabled."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        mock_config.get.side_effect = lambda key, default=None: {
            'DISCOVER_NEW_WORDS_ENABLED': False,
        }.get(key, default)

        processor = WordDiscoveryProcessor()
        result = processor.run()

        assert result['status'] == 'skipped'
        assert result['reason'] == 'disabled'

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.base.get_db_manager')
    @patch.object(WordDiscoveryProcessor, '_initialize_analysis')
    @patch.object(WordDiscoveryProcessor, '_fetch_new_messages_info')
    @patch.object(WordDiscoveryProcessor, '_finalize_analysis')
    def test_run_no_messages(
        self, mock_finalize, mock_fetch, mock_init, mock_get_db_manager, mock_config
    ):
        """Test run when there are no new messages."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        mock_config.get.side_effect = lambda key, default=None: {
            'DISCOVER_NEW_WORDS_ENABLED': True,
        }.get(key, default)
        mock_init.return_value = 1
        mock_fetch.return_value = (None, 0)

        processor = WordDiscoveryProcessor()
        result = processor.run()

        assert result['status'] == 'completed'
        assert result['messages_analyzed'] == 0
        mock_finalize.assert_called_once()

    @patch('app.etl.processors.word_discovery.ETLConfig')
    @patch('app.etl.processors.base.get_db_manager')
    @patch.object(WordDiscoveryProcessor, '_initialize_analysis')
    @patch.object(WordDiscoveryProcessor, '_update_analysis_log_failed')
    def test_run_handles_exception(
        self, mock_update_failed, mock_init, mock_get_db_manager, mock_config
    ):
        """Test run handles exceptions gracefully."""
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager

        mock_config.get.side_effect = lambda key, default=None: {
            'DISCOVER_NEW_WORDS_ENABLED': True,
        }.get(key, default)
        mock_init.side_effect = Exception("DB Error")

        processor = WordDiscoveryProcessor()
        result = processor.run()

        assert result['status'] == 'failed'
        assert 'DB Error' in result['error']
        mock_update_failed.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_initialize_analysis_creates_log(self, mock_get_db_manager):
        """Test _initialize_analysis creates WordAnalysisLog record via ORM."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        def fake_refresh(log):
            log.id = 42
        mock_session.refresh.side_effect = fake_refresh

        processor = WordDiscoveryProcessor(etl_log_id=99)
        log_id = processor._initialize_analysis('test_run_id')

        assert log_id == 42
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

        # Verify the log object attributes
        added_log = mock_session.add.call_args[0][0]
        assert added_log.run_id == 'test_run_id'
        assert added_log.etl_log_id == 99
        assert added_log.status == 'running'

    @patch('app.etl.processors.base.get_db_manager')
    def test_load_existing_dictionaries(self, mock_get_db_manager):
        """Test _load_existing_dictionaries uses ORM queries."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        # Mock ReplaceWord results
        mock_rw1 = MagicMock(source_word='kusa', target_word='草')
        mock_rw2 = MagicMock(source_word='wwww', target_word='草')
        # Mock SpecialWord results
        mock_sw1 = MagicMock(word='hololive')

        query_mocks = iter([
            MagicMock(all=MagicMock(return_value=[mock_rw1, mock_rw2])),  # ReplaceWord.all()
            MagicMock(all=MagicMock(return_value=[mock_sw1])),  # SpecialWord.all()
        ])
        mock_session.query.side_effect = lambda *args: next(query_mocks)

        processor = WordDiscoveryProcessor()
        dicts = processor._load_existing_dictionaries()

        assert dicts['replace_mapping'] == {'kusa': '草', 'wwww': '草'}
        assert dicts['special_words'] == {'hololive'}
        assert 'kusa' in dicts['replace_sources']
        assert '草' in dicts['replace_targets']
        assert '草' in dicts['protected_words']
        assert 'hololive' in dicts['protected_words']
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_finalize_analysis_updates_log(self, mock_get_db_manager):
        """Test _finalize_analysis updates WordAnalysisLog via ORM."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_log = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_log

        processor = WordDiscoveryProcessor()
        from datetime import datetime
        processor._finalize_analysis(1, 'test_run', datetime.now(), 100, 5, 3)

        assert mock_log.status == 'completed'
        assert mock_log.messages_analyzed == 100
        assert mock_log.new_replace_words_found == 5
        assert mock_log.new_special_words_found == 3
        assert mock_log.api_calls_made == 1
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_update_analysis_log_failed(self, mock_get_db_manager):
        """Test _update_analysis_log_failed updates log to failed status."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_log = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_log

        processor = WordDiscoveryProcessor()
        from datetime import datetime
        processor._update_analysis_log_failed('test_run', 'some error', datetime.now())

        assert mock_log.status == 'failed'
        assert mock_log.error_message == 'some error'
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_update_checkpoint_existing(self, mock_get_db_manager):
        """Test _update_checkpoint updates existing checkpoint."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_checkpoint = MagicMock()
        mock_session.query.return_value.order_by.return_value.first.return_value = mock_checkpoint

        processor = WordDiscoveryProcessor()
        processor._update_checkpoint({
            'message_id': 'msg_123',
            'published_at': '2026-01-15T12:00:00'
        })

        assert mock_checkpoint.last_analyzed_message_id == 'msg_123'
        assert mock_checkpoint.last_analyzed_timestamp == '2026-01-15T12:00:00'
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_update_checkpoint_new(self, mock_get_db_manager):
        """Test _update_checkpoint creates new checkpoint when none exists."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_session.query.return_value.order_by.return_value.first.return_value = None

        processor = WordDiscoveryProcessor()
        processor._update_checkpoint({
            'message_id': 'msg_123',
            'published_at': '2026-01-15T12:00:00'
        })

        mock_session.add.assert_called_once()
        added_checkpoint = mock_session.add.call_args[0][0]
        assert added_checkpoint.last_analyzed_message_id == 'msg_123'
        mock_session.commit.assert_called_once()
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_load_active_prompt_template_found(self, mock_get_db_manager):
        """Test _load_active_prompt_template returns template when found."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_template = MagicMock(template='Test prompt template')
        mock_session.query.return_value.filter.return_value.first.return_value = mock_template

        processor = WordDiscoveryProcessor()
        result = processor._load_active_prompt_template()

        assert result == 'Test prompt template'
        mock_session.close.assert_called_once()

    @patch('app.etl.processors.base.get_db_manager')
    def test_load_active_prompt_template_not_found(self, mock_get_db_manager):
        """Test _load_active_prompt_template returns None when no active template."""
        mock_manager = MagicMock()
        mock_session = MagicMock()
        mock_manager.get_session.return_value = mock_session
        mock_get_db_manager.return_value = mock_manager

        mock_session.query.return_value.filter.return_value.first.return_value = None

        processor = WordDiscoveryProcessor()
        result = processor._load_active_prompt_template()

        assert result is None
        mock_session.close.assert_called_once()
