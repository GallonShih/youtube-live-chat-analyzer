import pytest
from unittest.mock import MagicMock, patch
from app.etl import scheduler

@pytest.fixture(autouse=True)
def cleanup_scheduler():
    # Setup: Reset scheduler before test
    scheduler._scheduler = None
    yield
    # Teardown: Reset scheduler after test
    scheduler._scheduler = None

def test_init_scheduler():
    with patch('app.etl.scheduler.BackgroundScheduler') as MockScheduler:
        with patch('app.etl.scheduler.SQLAlchemyJobStore'):
            with patch('app.etl.scheduler.ThreadPoolExecutor'):
                sched = scheduler.init_scheduler('sqlite:///')
                assert sched is not None
                assert scheduler.get_scheduler() is sched
                MockScheduler.assert_called_once()
                
                # Test singleton (should return same instance without re-init)
                MockScheduler.reset_mock()
                sched2 = scheduler.init_scheduler('sqlite:///')
                assert sched2 is sched
                MockScheduler.assert_not_called()

def test_register_jobs():
    scheduler._scheduler = MagicMock()
    
    # We need to mock the task imports inside the function
    with patch.dict('sys.modules', {
        'app.etl.tasks': MagicMock(),
    }):
        # Mocking the functions imported from app.etl.tasks
        # Since they are imported inside register_jobs, we might need to mock them where they are used
        # or mock the whole module.
        # But register_jobs does `from app.etl.tasks import ...`
        
        # Easier way: Let it import, but mock the add_job call
         scheduler.register_jobs()
         assert scheduler._scheduler.add_job.call_count == 3
         args_list = scheduler._scheduler.add_job.call_args_list
         assert args_list[0][1]['id'] == 'process_chat_messages'
         assert args_list[1][1]['id'] == 'discover_new_words'
         assert args_list[2][1]['id'] == 'monitor_collector'

def test_start_scheduler():
    scheduler._scheduler = MagicMock()
    scheduler._scheduler.running = False
    
    scheduler.start_scheduler()
    scheduler._scheduler.start.assert_called_once()
    
    # Test already running
    scheduler._scheduler.running = True
    scheduler._scheduler.start.reset_mock()
    scheduler.start_scheduler()
    scheduler._scheduler.start.assert_not_called()

def test_start_scheduler_not_init():
    with pytest.raises(RuntimeError):
        scheduler.start_scheduler()

def test_get_all_jobs():
    scheduler._scheduler = MagicMock()
    mock_job = MagicMock()
    mock_job.id = 'job1'
    mock_job.name = 'Job 1'
    mock_job.next_run_time.isoformat.return_value = '2026-01-01T00:00:00'
    mock_job.trigger = 'cron'
    
    scheduler._scheduler.get_jobs.return_value = [mock_job]
    
    jobs = scheduler.get_all_jobs()
    assert len(jobs) == 1
    assert jobs[0]['id'] == 'job1'
    assert jobs[0]['is_paused'] is False
    
    # Test paused job
    mock_job.next_run_time = None
    jobs = scheduler.get_all_jobs()
    assert jobs[0]['is_paused'] is True

def test_get_all_jobs_no_scheduler():
    assert scheduler.get_all_jobs() == []

def test_job_operations():
    scheduler._scheduler = MagicMock()
    mock_job = MagicMock()
    scheduler._scheduler.get_job.return_value = mock_job
    
    # Test pause
    assert scheduler.pause_job('job1') is True
    mock_job.pause.assert_called_once()
    
    # Test resume
    assert scheduler.resume_job('job1') is True
    mock_job.resume.assert_called_once()
    
    # Test trigger
    with patch('app.etl.scheduler.datetime') as mock_dt:
        assert scheduler.trigger_job('job1') is True
        mock_job.modify.assert_called_once()

def test_job_operations_not_found():
    scheduler._scheduler = MagicMock()
    scheduler._scheduler.get_job.return_value = None
    
    assert scheduler.pause_job('job1') is False
    assert scheduler.resume_job('job1') is False
    assert scheduler.trigger_job('job1') is False

def test_job_operations_no_scheduler():
    assert scheduler.pause_job('job1') is False
    assert scheduler.resume_job('job1') is False
    assert scheduler.trigger_job('job1') is False

def test_shutdown():
    mock_sched = MagicMock()
    scheduler._scheduler = mock_sched
    mock_sched.running = True
    
    scheduler.shutdown_scheduler()
    mock_sched.shutdown.assert_called_once_with(wait=True)
    assert scheduler._scheduler is None
