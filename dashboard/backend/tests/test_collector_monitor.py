"""
Tests for CollectorMonitor processor (ORM-based).
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone, timedelta

from app.etl.processors.collector_monitor import CollectorMonitor


_UNSET = object()


def _make_query_mock(first=_UNSET, all=_UNSET, scalar=_UNSET):
    """Helper to create a mock for session.query() chain."""
    mock_q = MagicMock()
    chain = mock_q.filter.return_value
    if first is not _UNSET:
        chain.first.return_value = first
    if all is not _UNSET:
        chain.all.return_value = all
    if scalar is not _UNSET:
        chain.scalar.return_value = scalar
    return mock_q


@pytest.fixture
def monitor():
    """Create a CollectorMonitor with mocked db_manager."""
    with patch('app.etl.processors.base.get_db_manager') as mock_get_db_manager:
        mock_manager = MagicMock()
        mock_get_db_manager.return_value = mock_manager
        m = CollectorMonitor()
    return m


# ============ Skip Conditions ============

@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_skip_when_disabled(mock_get_db_manager, mock_config):
    """Test monitor skips when MONITOR_ENABLED is false."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': False,
    }.get(key, default)

    m = CollectorMonitor()
    result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'monitor_disabled'


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_skip_when_no_webhook_url(mock_get_db_manager, mock_config):
    """Test monitor skips when DISCORD_WEBHOOK_URL is empty."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': '',
    }.get(key, default)

    m = CollectorMonitor()
    result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'no_webhook_url'


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_skip_when_no_active_streams(mock_get_db_manager, mock_config):
    """Test monitor skips when no active live streams."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
    }.get(key, default)

    m = CollectorMonitor()

    with patch.object(m, '_get_active_streams', return_value=[]):
        result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'no_active_streams'


# ============ Active Streams ============

def test_get_active_streams_no_youtube_url(monitor):
    """Test _get_active_streams returns empty when no youtube_url configured."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    # SystemSetting query returns None (no youtube_url)
    mock_session.query.return_value.filter.return_value.first.return_value = None

    result = monitor._get_active_streams()

    assert result == []
    mock_session.close.assert_called_once()


def test_get_active_streams_invalid_url(monitor):
    """Test _get_active_streams returns empty with invalid URL."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    mock_setting = MagicMock()
    mock_setting.value = 'not-a-valid-url'
    mock_session.query.return_value.filter.return_value.first.return_value = mock_setting

    result = monitor._get_active_streams()

    assert result == []
    mock_session.close.assert_called_once()


def test_get_active_streams_not_live(monitor):
    """Test _get_active_streams returns empty when stream is not live."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    mock_setting = MagicMock()
    mock_setting.value = 'https://www.youtube.com/watch?v=abc12345678'

    # Two sequential query() calls: SystemSetting then LiveStream
    query_mocks = iter([
        _make_query_mock(first=mock_setting),
        _make_query_mock(all=[]),
    ])
    mock_session.query.side_effect = lambda *args: next(query_mocks)

    result = monitor._get_active_streams()

    assert result == []
    mock_session.close.assert_called_once()


def test_get_active_streams_with_upcoming(monitor):
    """Test _get_active_streams includes streams in 'upcoming' state."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    mock_setting = MagicMock()
    mock_setting.value = 'https://www.youtube.com/watch?v=abc12345678'

    mock_stream = MagicMock()
    mock_stream.video_id = 'abc12345678'
    mock_stream.title = 'Upcoming Stream'
    mock_stream.live_broadcast_content = 'upcoming'

    query_mocks = iter([
        _make_query_mock(first=mock_setting),
        _make_query_mock(all=[mock_stream]),
    ])
    mock_session.query.side_effect = lambda *args: next(query_mocks)

    result = monitor._get_active_streams()

    assert len(result) == 1
    assert result[0]['video_id'] == 'abc12345678'
    assert result[0]['title'] == 'Upcoming Stream'
    assert result[0]['live_broadcast_content'] == 'upcoming'


def test_get_active_streams_with_live(monitor):
    """Test _get_active_streams includes streams in 'live' state."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    mock_setting = MagicMock()
    mock_setting.value = 'https://www.youtube.com/watch?v=xyz87654321'

    mock_stream = MagicMock()
    mock_stream.video_id = 'xyz87654321'
    mock_stream.title = 'Live Stream'
    mock_stream.live_broadcast_content = 'live'

    query_mocks = iter([
        _make_query_mock(first=mock_setting),
        _make_query_mock(all=[mock_stream]),
    ])
    mock_session.query.side_effect = lambda *args: next(query_mocks)

    result = monitor._get_active_streams()

    assert len(result) == 1
    assert result[0]['video_id'] == 'xyz87654321'
    assert result[0]['title'] == 'Live Stream'
    assert result[0]['live_broadcast_content'] == 'live'


# ============ Video ID Extraction ============

def test_extract_video_id_standard_url():
    """Test extracting video ID from standard YouTube URL."""
    assert CollectorMonitor._extract_video_id('https://www.youtube.com/watch?v=abc12345678') == 'abc12345678'


def test_extract_video_id_short_url():
    """Test extracting video ID from short YouTube URL."""
    assert CollectorMonitor._extract_video_id('https://youtu.be/abc12345678') == 'abc12345678'


def test_extract_video_id_invalid():
    """Test extracting video ID from invalid URL."""
    assert CollectorMonitor._extract_video_id('not-a-url') is None


# ============ Data Freshness ============

def test_check_data_freshness(monitor):
    """Test _check_data_freshness returns timestamps."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    now = datetime.now(timezone.utc)

    # Two sequential query() calls: ChatMessage max, StreamStats max
    query_mocks = iter([
        _make_query_mock(scalar=now),
        _make_query_mock(scalar=now - timedelta(minutes=5)),
    ])
    mock_session.query.side_effect = lambda *args: next(query_mocks)

    result = monitor._check_data_freshness('test_video')

    assert result['chat_messages'] == now
    assert result['stream_stats'] == now - timedelta(minutes=5)
    mock_session.close.assert_called_once()


def test_check_data_freshness_no_data(monitor):
    """Test _check_data_freshness when no data exists."""
    mock_session = MagicMock()
    monitor.db_manager.get_session.return_value = mock_session

    query_mocks = iter([
        _make_query_mock(scalar=None),
        _make_query_mock(scalar=None),
    ])
    mock_session.query.side_effect = lambda *args: next(query_mocks)

    result = monitor._check_data_freshness('test_video')

    assert result['chat_messages'] is None
    assert result['stream_stats'] is None
    mock_session.close.assert_called_once()


# ============ Alert State ============

@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_get_alert_state_empty(mock_get_db_manager, mock_config):
    """Test _get_alert_state returns empty dict when no state."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.return_value = '{}'
    m = CollectorMonitor()

    state = m._get_alert_state()

    assert state == {}


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_get_alert_state_with_data(mock_get_db_manager, mock_config):
    """Test _get_alert_state parses existing state."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.return_value = '{"vid1:chat_messages": "2026-01-01T00:00:00+00:00"}'
    m = CollectorMonitor()

    state = m._get_alert_state()

    assert 'vid1:chat_messages' in state


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_get_alert_state_invalid_json(mock_get_db_manager, mock_config):
    """Test _get_alert_state handles invalid JSON gracefully."""
    mock_get_db_manager.return_value = MagicMock()
    mock_config.get.return_value = 'not-valid-json'
    m = CollectorMonitor()

    state = m._get_alert_state()

    assert state == {}


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_set_alert_state(mock_get_db_manager, mock_config):
    """Test _set_alert_state writes JSON to ETLConfig."""
    mock_get_db_manager.return_value = MagicMock()
    m = CollectorMonitor()
    state = {'vid1:chat_messages': '2026-01-01T00:00:00+00:00'}

    m._set_alert_state(state)

    mock_config.set.assert_called_once_with(
        'MONITOR_ALERT_STATE',
        json.dumps(state),
        'string',
    )


# ============ Discord Posting ============

@patch('app.etl.processors.collector_monitor.requests')
def test_post_discord_success(mock_requests):
    """Test successful Discord webhook post."""
    mock_resp = MagicMock()
    mock_resp.status_code = 204
    mock_requests.post.return_value = mock_resp

    result = CollectorMonitor._post_discord(
        'https://discord.com/api/webhooks/test',
        [{'title': 'test'}],
    )

    assert result is True
    mock_requests.post.assert_called_once()


@patch('app.etl.processors.collector_monitor.requests')
def test_post_discord_failure(mock_requests):
    """Test failed Discord webhook post."""
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = 'Bad Request'
    mock_requests.post.return_value = mock_resp

    result = CollectorMonitor._post_discord(
        'https://discord.com/api/webhooks/test',
        [{'title': 'test'}],
    )

    assert result is False


@patch('app.etl.processors.collector_monitor.requests')
def test_post_discord_exception(mock_requests):
    """Test Discord webhook post with network error."""
    mock_requests.post.side_effect = Exception("Connection timeout")

    result = CollectorMonitor._post_discord(
        'https://discord.com/api/webhooks/test',
        [{'title': 'test'}],
    )

    assert result is False


# ============ Full Run - Alert Flow ============

@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_run_sends_alert_when_stale(mock_get_db_manager, mock_config):
    """Test full run sends alert when data is stale."""
    mock_get_db_manager.return_value = MagicMock()
    now = datetime.now(timezone.utc)
    stale_time = now - timedelta(minutes=30)

    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': '{}',
    }.get(key, default)

    m = CollectorMonitor()

    with patch.object(m, '_get_active_streams', return_value=[
        {'video_id': 'abc12345678', 'title': 'Test Stream', 'live_broadcast_content': 'live'}
    ]):
        with patch.object(m, '_check_data_freshness', return_value={
            'chat_messages': stale_time,
            'stream_stats': stale_time,
        }):
            with patch.object(m, '_send_discord_alert', return_value=True) as mock_alert:
                with patch.object(m, '_set_alert_state') as mock_set_state:
                    result = m.run()

    assert result['status'] == 'completed'
    assert result['alerts_sent'] == 2
    mock_alert.assert_called_once()
    mock_set_state.assert_called_once()


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_run_no_duplicate_alert(mock_get_db_manager, mock_config):
    """Test full run does not send duplicate alerts for already-alerted streams."""
    mock_get_db_manager.return_value = MagicMock()
    now = datetime.now(timezone.utc)
    stale_time = now - timedelta(minutes=30)

    # Alert state already has entries for this stream
    existing_state = json.dumps({
        'abc12345678:chat_messages': (now - timedelta(minutes=20)).isoformat(),
        'abc12345678:stream_stats': (now - timedelta(minutes=20)).isoformat(),
    })

    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': existing_state,
    }.get(key, default)

    m = CollectorMonitor()

    with patch.object(m, '_get_active_streams', return_value=[
        {'video_id': 'abc12345678', 'title': 'Test Stream', 'live_broadcast_content': 'live'}
    ]):
        with patch.object(m, '_check_data_freshness', return_value={
            'chat_messages': stale_time,
            'stream_stats': stale_time,
        }):
            with patch.object(m, '_send_discord_alert', return_value=True) as mock_alert:
                with patch.object(m, '_set_alert_state'):
                    result = m.run()

    assert result['alerts_sent'] == 0
    mock_alert.assert_not_called()


@patch('app.etl.processors.collector_monitor.ETLConfig')
@patch('app.etl.processors.base.get_db_manager')
def test_run_sends_recovery(mock_get_db_manager, mock_config):
    """Test full run sends recovery when data resumes."""
    mock_get_db_manager.return_value = MagicMock()
    now = datetime.now(timezone.utc)
    fresh_time = now - timedelta(minutes=2)

    # Alert state has entries from a previous alert
    existing_state = json.dumps({
        'abc12345678:chat_messages': (now - timedelta(minutes=20)).isoformat(),
    })

    mock_config.get.side_effect = lambda key, default=None: {
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': existing_state,
    }.get(key, default)

    m = CollectorMonitor()

    with patch.object(m, '_get_active_streams', return_value=[
        {'video_id': 'abc12345678', 'title': 'Test Stream', 'live_broadcast_content': 'live'}
    ]):
        with patch.object(m, '_check_data_freshness', return_value={
            'chat_messages': fresh_time,
            'stream_stats': fresh_time,
        }):
            with patch.object(m, '_send_discord_recovery', return_value=True) as mock_recovery:
                with patch.object(m, '_set_alert_state') as mock_set_state:
                    result = m.run()

    assert result['recoveries_sent'] == 1
    mock_recovery.assert_called_once()
    # Alert state should have the key removed
    saved_state = mock_set_state.call_args[0][0]
    assert 'abc12345678:chat_messages' not in saved_state
