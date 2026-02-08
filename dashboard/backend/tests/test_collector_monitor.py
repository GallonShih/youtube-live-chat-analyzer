"""
Tests for CollectorMonitor processor.
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, timezone, timedelta

from app.etl.processors.collector_monitor import CollectorMonitor


@pytest.fixture
def monitor():
    """Create a CollectorMonitor with mocked engine."""
    with patch('app.etl.processors.collector_monitor.ETLConfig') as mock_config:
        mock_config.get.return_value = 'postgresql://test/db'
        m = CollectorMonitor(database_url='postgresql://test/db')
    return m


# ============ Skip Conditions ============

@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_skip_when_disabled(mock_config):
    """Test monitor skips when MONITOR_ENABLED is false."""
    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': False,
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')
    result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'monitor_disabled'


@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_skip_when_no_webhook_url(mock_config):
    """Test monitor skips when DISCORD_WEBHOOK_URL is empty."""
    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': '',
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')
    result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'no_webhook_url'


@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_skip_when_no_active_streams(mock_config):
    """Test monitor skips when no active live streams."""
    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')

    with patch.object(m, '_get_active_streams', return_value=[]):
        result = m.run()

    assert result['status'] == 'skipped'
    assert result['reason'] == 'no_active_streams'


# ============ Active Streams ============

def test_get_active_streams_no_youtube_url(monitor):
    """Test _get_active_streams returns empty when no youtube_url configured."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.fetchone.return_value = None
    monitor._engine = mock_engine

    result = monitor._get_active_streams()

    assert result == []


def test_get_active_streams_invalid_url(monitor):
    """Test _get_active_streams returns empty with invalid URL."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.fetchone.return_value = ('not-a-valid-url',)
    monitor._engine = mock_engine

    result = monitor._get_active_streams()

    assert result == []


def test_get_active_streams_not_live(monitor):
    """Test _get_active_streams returns empty when stream is not live."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn

    # First call: system_settings query
    # Second call: live_streams query
    mock_conn.execute.return_value.fetchone.return_value = ('https://www.youtube.com/watch?v=abc12345678',)
    mock_conn.execute.return_value.fetchall.return_value = []
    monitor._engine = mock_engine

    result = monitor._get_active_streams()

    assert result == []


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
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn

    now = datetime.now(timezone.utc)
    mock_conn.execute.return_value.fetchone.side_effect = [
        (now,),  # chat_messages MAX(created_at)
        (now - timedelta(minutes=5),),  # stream_stats MAX(collected_at)
    ]
    monitor._engine = mock_engine

    result = monitor._check_data_freshness('test_video')

    assert result['chat_messages'] == now
    assert result['stream_stats'] == now - timedelta(minutes=5)


def test_check_data_freshness_no_data(monitor):
    """Test _check_data_freshness when no data exists."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.fetchone.side_effect = [
        (None,),  # chat_messages
        (None,),  # stream_stats
    ]
    monitor._engine = mock_engine

    result = monitor._check_data_freshness('test_video')

    assert result['chat_messages'] is None
    assert result['stream_stats'] is None


# ============ Alert State ============

@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_get_alert_state_empty(mock_config):
    """Test _get_alert_state returns empty dict when no state."""
    mock_config.get.return_value = '{}'
    m = CollectorMonitor(database_url='postgresql://test/db')

    state = m._get_alert_state()

    assert state == {}


@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_get_alert_state_with_data(mock_config):
    """Test _get_alert_state parses existing state."""
    mock_config.get.return_value = '{"vid1:chat_messages": "2026-01-01T00:00:00+00:00"}'
    m = CollectorMonitor(database_url='postgresql://test/db')

    state = m._get_alert_state()

    assert 'vid1:chat_messages' in state


@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_get_alert_state_invalid_json(mock_config):
    """Test _get_alert_state handles invalid JSON gracefully."""
    mock_config.get.return_value = 'not-valid-json'
    m = CollectorMonitor(database_url='postgresql://test/db')

    state = m._get_alert_state()

    assert state == {}


@patch('app.etl.processors.collector_monitor.ETLConfig')
def test_set_alert_state(mock_config):
    """Test _set_alert_state writes JSON to ETLConfig."""
    m = CollectorMonitor(database_url='postgresql://test/db')
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
def test_run_sends_alert_when_stale(mock_config):
    """Test full run sends alert when data is stale."""
    now = datetime.now(timezone.utc)
    stale_time = now - timedelta(minutes=30)

    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': '{}',
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')

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
def test_run_no_duplicate_alert(mock_config):
    """Test full run does not send duplicate alerts for already-alerted streams."""
    now = datetime.now(timezone.utc)
    stale_time = now - timedelta(minutes=30)

    # Alert state already has entries for this stream
    existing_state = json.dumps({
        'abc12345678:chat_messages': (now - timedelta(minutes=20)).isoformat(),
        'abc12345678:stream_stats': (now - timedelta(minutes=20)).isoformat(),
    })

    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': existing_state,
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')

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
def test_run_sends_recovery(mock_config):
    """Test full run sends recovery when data resumes."""
    now = datetime.now(timezone.utc)
    fresh_time = now - timedelta(minutes=2)

    # Alert state has entries from a previous alert
    existing_state = json.dumps({
        'abc12345678:chat_messages': (now - timedelta(minutes=20)).isoformat(),
    })

    mock_config.get.side_effect = lambda key, default=None: {
        'DATABASE_URL': 'postgresql://test/db',
        'MONITOR_ENABLED': True,
        'DISCORD_WEBHOOK_URL': 'https://discord.com/api/webhooks/test',
        'MONITOR_NO_DATA_THRESHOLD_MINUTES': 10,
        'MONITOR_ALERT_STATE': existing_state,
    }.get(key, default)

    m = CollectorMonitor(database_url='postgresql://test/db')

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
