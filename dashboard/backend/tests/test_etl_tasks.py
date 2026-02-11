import pytest
from unittest.mock import MagicMock, patch, ANY
from datetime import datetime
from app.etl.tasks import (
    create_etl_log, update_etl_log_status,
    run_process_chat_messages, run_import_dicts, run_discover_new_words,
    run_monitor_collector,
    JOB_NAMES, TASK_REGISTRY, MANUAL_TASKS
)

# ============ Helper Function Tests ============

@patch('app.etl.config.ETLConfig.get_engine')
def test_create_etl_log_success_scheduled(mock_get_engine):
    """Test creating an ETL log with scheduled trigger."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.scalar.return_value = 123  # returning ID
    
    log_id = create_etl_log('test_job', trigger_type='scheduled')
    
    assert log_id == 123
    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args
    assert "scheduled" in str(call_args)

@patch('app.etl.config.ETLConfig.get_engine')
def test_create_etl_log_success_manual(mock_get_engine):
    """Test creating an ETL log with manual trigger."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    mock_conn.execute.return_value.scalar.return_value = 456
    
    log_id = create_etl_log('test_job', trigger_type='manual')
    
    assert log_id == 456
    mock_conn.execute.assert_called_once()
    call_args = mock_conn.execute.call_args
    assert "manual" in str(call_args)

@patch('app.etl.config.ETLConfig.get_engine')
def test_update_etl_log_status_success(mock_get_engine):
    """Test updating ETL log status."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    
    success = update_etl_log_status(123, 'completed', records_processed=50)
    
    assert success is True
    mock_conn.execute.assert_called_once()

# ============ Task Function Tests ============

@patch('app.etl.processors.chat_processor.ChatProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_process_chat_messages_scheduled(mock_create, mock_update, mock_processor_class):
    """Test scheduled execution (no etl_log_id provided)."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.return_value = {'status': 'completed', 'total_processed': 10}
    mock_create.return_value = 100
    
    result = run_process_chat_messages()
    
    assert result['status'] == 'completed'
    # Should create new log with 'scheduled' trigger type
    mock_create.assert_called_once_with('process_chat_messages', 'scheduled')
    # Should update log to completed
    mock_update.assert_called_once_with(100, 'completed', records_processed=10)

@patch('app.etl.processors.chat_processor.ChatProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_process_chat_messages_manual(mock_create, mock_update, mock_processor_class):
    """Test manual execution (etl_log_id provided)."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.return_value = {'status': 'completed', 'total_processed': 10}
    
    etl_log_id = 999
    result = run_process_chat_messages(etl_log_id=etl_log_id)
    
    assert result['status'] == 'completed'
    # Should NOT create new log
    mock_create.assert_not_called()
    # Should update to completed only
    mock_update.assert_called_once_with(999, 'completed', records_processed=10)

@patch('app.etl.processors.chat_processor.ChatProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_process_chat_messages_failure(mock_create, mock_update, mock_processor_class):
    """Test task failure handling (scheduled)."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.side_effect = Exception("Task failed")
    mock_create.return_value = 100
    
    result = run_process_chat_messages()
    
    assert result['status'] == 'failed'
    assert 'Task failed' in result['error']
    mock_update.assert_called_with(100, 'failed', error_message='Task failed')


# ============ run_discover_new_words Tests ============

@patch('app.etl.processors.word_discovery.WordDiscoveryProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_discover_new_words_scheduled(mock_create, mock_update, mock_processor_class):
    """Test scheduled execution of discover_new_words."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.return_value = {'status': 'completed', 'messages_analyzed': 100}
    mock_create.return_value = 200
    
    result = run_discover_new_words()
    
    assert result['status'] == 'completed'
    mock_create.assert_called_once_with('discover_new_words', 'scheduled')
    mock_update.assert_called_once_with(
        200, 'completed', records_processed=100, error_message=None
    )


@patch('app.etl.processors.word_discovery.WordDiscoveryProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_discover_new_words_manual(mock_create, mock_update, mock_processor_class):
    """Test manual execution of discover_new_words."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.return_value = {'status': 'completed', 'messages_analyzed': 50}
    
    result = run_discover_new_words(etl_log_id=888)
    
    assert result['status'] == 'completed'
    mock_create.assert_not_called()
    mock_update.assert_called_once()


@patch('app.etl.processors.word_discovery.WordDiscoveryProcessor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_discover_new_words_failure(mock_create, mock_update, mock_processor_class):
    """Test discover_new_words failure handling."""
    mock_processor = MagicMock()
    mock_processor_class.return_value = mock_processor
    mock_processor.run.side_effect = Exception("AI service unavailable")
    mock_create.return_value = 200
    
    result = run_discover_new_words()
    
    assert result['status'] == 'failed'
    assert 'AI service unavailable' in result['error']
    mock_update.assert_called_with(200, 'failed', error_message='AI service unavailable')


# ============ run_import_dicts Tests ============

@patch('app.etl.processors.dict_importer.DictImporter')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_import_dicts_scheduled(mock_create, mock_update, mock_importer_class):
    """Test scheduled execution of import_dicts."""
    mock_importer = MagicMock()
    mock_importer_class.return_value = mock_importer
    mock_importer.run.return_value = {'status': 'completed', 'total_processed': 500}
    mock_create.return_value = 300
    
    result = run_import_dicts()
    
    assert result['status'] == 'completed'
    # import_dicts is a manual-only task
    mock_create.assert_called_once_with('import_dicts', 'manual')
    mock_update.assert_called_once_with(300, 'completed', records_processed=500, error_message=None)


@patch('app.etl.processors.dict_importer.DictImporter')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_import_dicts_manual(mock_create, mock_update, mock_importer_class):
    """Test manual execution of import_dicts."""
    mock_importer = MagicMock()
    mock_importer_class.return_value = mock_importer
    mock_importer.run.return_value = {'status': 'completed', 'total_processed': 250}
    
    result = run_import_dicts(etl_log_id=777)
    
    assert result['status'] == 'completed'
    mock_create.assert_not_called()
    mock_update.assert_called_once()


@patch('app.etl.processors.dict_importer.DictImporter')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_import_dicts_failure(mock_create, mock_update, mock_importer_class):
    """Test import_dicts failure handling."""
    mock_importer = MagicMock()
    mock_importer_class.return_value = mock_importer
    mock_importer.run.side_effect = Exception("File not found")
    mock_create.return_value = 300
    
    result = run_import_dicts()
    
    assert result['status'] == 'failed'
    assert 'File not found' in result['error']
    mock_update.assert_called_with(300, 'failed', error_message='File not found')


# ============ ETL Log Edge Cases ============

@patch('app.etl.config.ETLConfig.get_engine')
def test_create_etl_log_no_engine(mock_get_engine):
    """Test create_etl_log when engine is not initialized."""
    mock_get_engine.return_value = None
    
    log_id = create_etl_log('test_job')
    
    assert log_id is None


@patch('app.etl.config.ETLConfig.get_engine')
def test_create_etl_log_exception(mock_get_engine):
    """Test create_etl_log when database operation fails."""
    mock_engine = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.side_effect = Exception("Connection failed")
    
    log_id = create_etl_log('test_job')
    
    assert log_id is None


@patch('app.etl.config.ETLConfig.get_engine')
def test_update_etl_log_status_no_engine(mock_get_engine):
    """Test update_etl_log_status when engine is not initialized."""
    mock_get_engine.return_value = None
    
    success = update_etl_log_status(123, 'completed')
    
    assert success is False


@patch('app.etl.config.ETLConfig.get_engine')
def test_update_etl_log_status_failed(mock_get_engine):
    """Test update_etl_log_status with failed status."""
    mock_engine = MagicMock()
    mock_conn = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.return_value.__enter__.return_value = mock_conn
    
    success = update_etl_log_status(123, 'failed', error_message='Test error')
    
    assert success is True
    mock_conn.execute.assert_called_once()


@patch('app.etl.config.ETLConfig.get_engine')
def test_update_etl_log_status_exception(mock_get_engine):
    """Test update_etl_log_status when database operation fails."""
    mock_engine = MagicMock()
    mock_get_engine.return_value = mock_engine
    mock_engine.connect.side_effect = Exception("Connection failed")
    
    success = update_etl_log_status(123, 'completed')
    
    assert success is False


# ============ Registry and Constants Tests ============

def test_job_names_registry():
    """Test JOB_NAMES contains expected jobs."""
    assert 'process_chat_messages' in JOB_NAMES
    assert 'discover_new_words' in JOB_NAMES
    assert 'import_dicts' in JOB_NAMES
    assert 'monitor_collector' in JOB_NAMES


def test_task_registry():
    """Test TASK_REGISTRY contains callable tasks."""
    assert 'process_chat_messages' in TASK_REGISTRY
    assert 'discover_new_words' in TASK_REGISTRY
    assert 'import_dicts' in TASK_REGISTRY
    assert 'monitor_collector' in TASK_REGISTRY

    for task_func in TASK_REGISTRY.values():
        assert callable(task_func)


def test_manual_tasks_list():
    """Test MANUAL_TASKS contains expected manual task."""
    assert len(MANUAL_TASKS) >= 1
    import_dict_task = next((t for t in MANUAL_TASKS if t['id'] == 'import_dicts'), None)
    assert import_dict_task is not None
    assert import_dict_task['type'] == 'manual'


# ============ run_monitor_collector Tests ============

@patch('app.etl.processors.collector_monitor.CollectorMonitor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_monitor_collector_scheduled(mock_create, mock_update, mock_monitor_class):
    """Test scheduled execution of monitor_collector."""
    mock_monitor = MagicMock()
    mock_monitor_class.return_value = mock_monitor
    mock_monitor.run.return_value = {'status': 'completed', 'streams_checked': 1, 'alerts_sent': 0, 'recoveries_sent': 0}
    mock_create.return_value = 400

    result = run_monitor_collector()

    assert result['status'] == 'completed'
    mock_create.assert_called_once_with('monitor_collector', 'scheduled')
    mock_update.assert_called_once_with(400, 'completed', records_processed=1)


@patch('app.etl.processors.collector_monitor.CollectorMonitor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_monitor_collector_manual(mock_create, mock_update, mock_monitor_class):
    """Test manual execution of monitor_collector."""
    mock_monitor = MagicMock()
    mock_monitor_class.return_value = mock_monitor
    mock_monitor.run.return_value = {'status': 'completed', 'streams_checked': 1, 'alerts_sent': 2, 'recoveries_sent': 0}

    result = run_monitor_collector(etl_log_id=555)

    assert result['status'] == 'completed'
    mock_create.assert_not_called()
    mock_update.assert_called_once()


@patch('app.etl.processors.collector_monitor.CollectorMonitor')
@patch('app.etl.tasks.update_etl_log_status')
@patch('app.etl.tasks.create_etl_log')
def test_run_monitor_collector_failure(mock_create, mock_update, mock_monitor_class):
    """Test monitor_collector failure handling."""
    mock_monitor = MagicMock()
    mock_monitor_class.return_value = mock_monitor
    mock_monitor.run.side_effect = Exception("Connection refused")
    mock_create.return_value = 400

    result = run_monitor_collector()

    assert result['status'] == 'failed'
    assert 'Connection refused' in result['error']
    mock_update.assert_called_with(400, 'failed', error_message='Connection refused')