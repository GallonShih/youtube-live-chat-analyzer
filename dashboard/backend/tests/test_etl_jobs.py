"""
Unit tests for ETL jobs router.
Tests ETL job management, execution logs, and settings.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone


@pytest.fixture
def sample_etl_settings(db):
    """Create sample ETL settings."""
    from app.models import ETLSetting
    
    settings = [
        ETLSetting(key='test_api_key', value='test_value', category='api', description='Test API key'),
        ETLSetting(key='test_etl_interval', value='3600', category='etl', description='Test interval'),
        ETLSetting(key='test_import_batch', value='100', category='import', description='Batch size')
    ]
    db.add_all(settings)
    db.flush()


@pytest.fixture
def sample_execution_logs(db):
    """Create sample ETL execution logs."""
    from app.models import ETLExecutionLog
    from datetime import datetime, timezone, timedelta
    
    now = datetime.now(timezone.utc)
    logs = [
        ETLExecutionLog(
            job_id='test_job_1',
            job_name='Test Job 1',
            status='completed',
            trigger_type='manual',
            started_at=now - timedelta(hours=1),
            completed_at=now - timedelta(minutes=55),
            records_processed=100
        ),
        ETLExecutionLog(
            job_id='test_job_1',
            job_name='Test Job 1',
            status='failed',
            trigger_type='manual',
            started_at=now - timedelta(hours=2),
            completed_at=now - timedelta(hours=1, minutes=55),
            error_message='Test error'
        ),
        ETLExecutionLog(
            job_id='test_job_2',
            job_name='Test Job 2',
            status='running',
            trigger_type='manual',
            started_at=now - timedelta(minutes=10)
        ),
        ETLExecutionLog(
            job_id='test_job_2',
            job_name='Test Job 2',
            status='completed',
            trigger_type='scheduled',
            started_at=now - timedelta(hours=3),
            completed_at=now - timedelta(hours=2, minutes=50),
            records_processed=50
        )
    ]
    db.add_all(logs)
    db.flush()


# ============ Job Listing Tests ============

@patch('app.routers.etl_jobs.get_all_jobs')
def test_list_jobs(mock_get_all_jobs, client, db):
    """Test listing all ETL jobs."""
    mock_get_all_jobs.return_value = [
        {
            'id': 'process_chat',
            'name': 'Process Chat Messages',
            'next_run_time': '2026-01-12T10:00:00Z',
            'paused': False
        }
    ]
    
    response = client.get("/api/admin/etl/jobs")
    assert response.status_code == 200
    data = response.json()
    assert 'scheduled' in data
    assert 'manual' in data
    assert len(data['scheduled']) == 1
    # manual jobs come from MANUAL_TASKS in the router, which we didn't mock here


# ============ Job Detail Tests ============

@patch('app.routers.etl_jobs.get_job')
def test_get_job_detail(mock_get_job, client, db):
    """Test getting job detail."""
    mock_job = MagicMock()
    mock_job.id = 'process_chat'
    mock_job.name = 'Process Chat Messages'
    mock_job.next_run_time = datetime(2026, 1, 12, 10, 0, 0, tzinfo=timezone.utc)
    mock_job.trigger = 'cron'
    mock_get_job.return_value = mock_job
    
    response = client.get("/api/admin/etl/jobs/process_chat")
    assert response.status_code == 200
    data = response.json()
    assert data['id'] == 'process_chat'
    assert data['name'] == 'Process Chat Messages'


@patch('app.routers.etl_jobs.get_job')
def test_get_job_detail_not_found(mock_get_job, client, db):
    """Test getting non-existent job detail."""
    mock_get_job.return_value = None
    
    response = client.get("/api/admin/etl/jobs/non_existent")
    assert response.status_code == 404


# ============ Job Trigger Tests ============

@patch('app.routers.etl_jobs.TASK_REGISTRY')
@patch('app.etl.tasks.create_etl_log')
@patch('concurrent.futures.ThreadPoolExecutor')
def test_trigger_job_success(mock_executor, mock_create_log, mock_task_registry, admin_client, db):
    """Test triggering a job successfully."""
    # Setup mock registry
    mock_task_registry.__contains__ = Mock(return_value=True)
    mock_task_registry.__getitem__ = Mock(return_value=Mock())

    # Setup mock create_log
    mock_create_log.return_value = 123

    response = admin_client.post("/api/admin/etl/jobs/test_job/trigger")

    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'running'
    assert data['etl_log_id'] == 123
    mock_create_log.assert_called_once_with('test_job', trigger_type='manual')
    mock_executor.return_value.submit.assert_called_once()


@patch('app.routers.etl_jobs.TASK_REGISTRY')
def test_trigger_job_not_found(mock_task_registry, admin_client, db):
    """Test triggering non-existent job."""
    mock_task_registry.__contains__ = Mock(return_value=False)

    response = admin_client.post("/api/admin/etl/jobs/non_existent/trigger")
    assert response.status_code == 404


# ============ Job Pause/Resume Tests ============

@patch('app.routers.etl_jobs.pause_job')
def test_pause_job_success(mock_pause_job, admin_client, db):
    """Test pausing a job."""
    mock_pause_job.return_value = True

    response = admin_client.post("/api/admin/etl/jobs/test_job/pause")
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'paused'


@patch('app.routers.etl_jobs.pause_job')
def test_pause_job_not_found(mock_pause_job, admin_client, db):
    """Test pausing non-existent job."""
    mock_pause_job.return_value = False

    response = admin_client.post("/api/admin/etl/jobs/non_existent/pause")
    assert response.status_code == 404


@patch('app.routers.etl_jobs.resume_job')
def test_resume_job_success(mock_resume_job, admin_client, db):
    """Test resuming a job."""
    mock_resume_job.return_value = True

    response = admin_client.post("/api/admin/etl/jobs/test_job/resume")
    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'resumed'


@patch('app.routers.etl_jobs.resume_job')
def test_resume_job_not_found(mock_resume_job, admin_client, db):
    """Test resuming non-existent job."""
    mock_resume_job.return_value = False

    response = admin_client.post("/api/admin/etl/jobs/non_existent/resume")
    assert response.status_code == 404



# ============ Execution Logs Tests ============

def test_get_execution_logs_all(client, sample_execution_logs):
    """Test getting all execution logs."""
    response = client.get("/api/admin/etl/logs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "logs" in data
    assert len(data["logs"]) == 4
    assert data["total"] == 4


def test_get_execution_logs_by_job_id(client, sample_execution_logs):
    """Test getting execution logs filtered by job_id."""
    response = client.get("/api/admin/etl/logs?job_id=test_job_1")
    assert response.status_code == 200
    data = response.json()
    logs = data["logs"]
    assert len(logs) == 2
    for log in logs:
        assert log['job_id'] == 'test_job_1'


def test_get_execution_logs_by_status(client, sample_execution_logs):
    """Test getting execution logs filtered by status."""
    response = client.get("/api/admin/etl/logs?status=completed")
    assert response.status_code == 200
    data = response.json()
    logs = data["logs"]
    assert len(logs) == 2
    for log in logs:
        assert log['status'] == 'completed'


def test_get_execution_logs_with_limit(client, sample_execution_logs):
    """Test getting execution logs with limit."""
    response = client.get("/api/admin/etl/logs?limit=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["logs"]) == 2


def test_get_execution_logs_combined_filters(client, sample_execution_logs):
    """Test getting execution logs with combined filters."""
    response = client.get("/api/admin/etl/logs?job_id=test_job_1&status=completed&limit=10")
    assert response.status_code == 200
    data = response.json()
    logs = data["logs"]
    assert len(logs) == 1
    assert logs[0]['job_id'] == 'test_job_1'
    assert logs[0]['status'] == 'completed'


# ============ ETL Settings Tests ============

def test_get_etl_settings_all(client, sample_etl_settings):
    """Test getting all ETL settings."""
    response = client.get("/api/admin/etl/settings")
    assert response.status_code == 200
    data = response.json()
    assert "settings" in data
    assert len(data["settings"]) == 3


def test_get_etl_settings_by_category(client, sample_etl_settings):
    """Test getting ETL settings filtered by category."""
    response = client.get("/api/admin/etl/settings?category=api")
    assert response.status_code == 200
    data = response.json()
    settings = data["settings"]
    assert len(settings) == 1
    assert settings[0]['category'] == 'api'
    assert settings[0]['key'] == 'test_api_key'


def test_update_etl_setting_success(admin_client, client, sample_etl_settings):
    """Test updating an ETL setting."""
    key = "test_api_key"
    response = admin_client.put(f"/api/admin/etl/settings/{key}?value=new_value")
    assert response.status_code == 200
    result = response.json()
    assert result["success"] is True

    # Verify update
    response = client.get(f"/api/admin/etl/settings?category=api")
    data = response.json()
    setting = next(s for s in data["settings"] if s["key"] == key)
    assert setting["value"] == "new_value"


def test_update_etl_setting_not_found(admin_client, db):
    """Test updating non-existent setting."""
    response = admin_client.put("/api/admin/etl/settings/non_existent?value=test")
    assert response.status_code == 404


# ============ Scheduler Status Tests ============

@patch('app.routers.etl_jobs.get_scheduler')
def test_get_scheduler_status_running(mock_get_scheduler, client, db):
    """Test getting scheduler status when running."""
    mock_scheduler_instance = MagicMock()
    mock_scheduler_instance.running = True
    mock_scheduler_instance.get_jobs.return_value = [
        MagicMock(id='job1', name='Job 1', next_run_time=None),
        MagicMock(id='job2', name='Job 2', next_run_time=None)
    ]
    mock_get_scheduler.return_value = mock_scheduler_instance
    
    response = client.get("/api/admin/etl/status")
    assert response.status_code == 200
    data = response.json()
    assert data['running'] is True
    assert data['jobs_count'] == 2


@patch('app.routers.etl_jobs.get_scheduler')
def test_get_scheduler_status_stopped(mock_get_scheduler, client, db):
    """Test getting scheduler status when stopped."""
    mock_scheduler_instance = MagicMock()
    mock_scheduler_instance.running = False
    mock_scheduler_instance.get_jobs.return_value = []
    mock_get_scheduler.return_value = mock_scheduler_instance
    
    response = client.get("/api/admin/etl/status")
    assert response.status_code == 200
    data = response.json()
    assert data['running'] is False
    assert data['jobs_count'] == 0
