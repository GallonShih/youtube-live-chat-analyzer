import React, { useState, useEffect, useCallback } from 'react';
import {
    PlayIcon,
    PauseIcon,
    ArrowPathIcon,
    ClockIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    Cog6ToothIcon,
    QueueListIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';
import {
    fetchETLJobs,
    fetchSchedulerStatus,
    triggerETLJob,
    pauseETLJob,
    resumeETLJob,
    fetchETLLogs,
} from '../../api/etl';
import ETLSettingsManager from './ETLSettingsManager';
import PromptTemplatesManager from './PromptTemplatesManager';

const StatusBadge = ({ status }) => {
    const styles = {
        running: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
        failed: 'bg-red-100 text-red-800',
        pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    );
};

const ETLJobsManager = () => {
    const [activeTab, setActiveTab] = useState('jobs');
    const [jobs, setJobs] = useState({ scheduled: [], manual: [] });
    const [schedulerStatus, setSchedulerStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [triggeringJob, setTriggeringJob] = useState(null);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [jobsData, statusData, logsData] = await Promise.all([
                fetchETLJobs(),
                fetchSchedulerStatus(),
                fetchETLLogs({ limit: 20 }),
            ]);
            setJobs(jobsData);
            setSchedulerStatus(statusData);
            setLogs(logsData.logs || []);
            setError(null);
        } catch (err) {
            console.error('Error loading ETL data:', err);
            setError('Failed to load ETL data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
        // 每 30 秒自動刷新
        const interval = setInterval(loadData, 30000);
        return () => clearInterval(interval);
    }, [loadData]);

    const handleTrigger = async (jobId) => {
        try {
            setTriggeringJob(jobId);
            await triggerETLJob(jobId);
            setSuccessMessage(`Task "${jobId}" has been triggered`);
            setTimeout(() => setSuccessMessage(null), 3000);
            // 立即刷新一次
            await loadData();
            // 1秒後再刷新（任務可能在背景執行）
            setTimeout(async () => {
                await loadData();
            }, 1000);
            // 3秒後最後刷新（確保看到執行記錄）
            setTimeout(async () => {
                await loadData();
            }, 3000);
        } catch (err) {
            console.error('Error triggering job:', err);
            setError(`Failed to trigger job: ${err.message}`);
        } finally {
            setTriggeringJob(null);
        }
    };

    const handlePause = async (jobId) => {
        try {
            await pauseETLJob(jobId);
            setSuccessMessage(`Task "${jobId}" has been paused`);
            setTimeout(() => setSuccessMessage(null), 3000);
            await loadData();
        } catch (err) {
            console.error('Error pausing job:', err);
            setError(`Failed to pause job: ${err.message}`);
        }
    };

    const handleResume = async (jobId) => {
        try {
            await resumeETLJob(jobId);
            setSuccessMessage(`Task "${jobId}" has been resumed`);
            setTimeout(() => setSuccessMessage(null), 3000);
            await loadData();
        } catch (err) {
            console.error('Error resuming job:', err);
            setError(`Failed to resume job: ${err.message}`);
        }
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '-';
        const date = new Date(isoString);
        return date.toLocaleString('zh-TW', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading && !jobs.scheduled.length && activeTab === 'jobs') {
        return (
            <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'jobs'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    onClick={() => setActiveTab('jobs')}
                >
                    <QueueListIcon className="w-4 h-4" />
                    Jobs
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'settings'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    onClick={() => setActiveTab('settings')}
                >
                    <Cog6ToothIcon className="w-4 h-4" />
                    Settings
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'prompts'
                        ? 'text-blue-600 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                    onClick={() => setActiveTab('prompts')}
                >
                    <SparklesIcon className="w-4 h-4" />
                    Prompts
                </button>
            </div>

            {/* Settings Tab */}
            {activeTab === 'settings' && <ETLSettingsManager />}

            {/* Prompts Tab */}
            {activeTab === 'prompts' && <PromptTemplatesManager />}

            {/* Jobs Tab */}
            {activeTab === 'jobs' && (
                <>
                    {/* Alerts */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <XCircleIcon className="w-5 h-5" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
                                &times;
                            </button>
                        </div>
                    )}
                    {successMessage && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            {successMessage}
                        </div>
                    )}

                    {/* Scheduler Status */}
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${schedulerStatus?.running ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className="font-medium">
                                    Scheduler: {schedulerStatus?.running ? 'Running' : 'Stopped'}
                                </span>
                                <span className="text-gray-500 text-sm">
                                    ({schedulerStatus?.jobs_count || 0} jobs)
                                </span>
                            </div>
                            <button
                                onClick={loadData}
                                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                title="Refresh"
                            >
                                <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Manual Tasks */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <PlayIcon className="w-5 h-5" />
                            Manual Tasks
                        </h3>
                        <div className="space-y-3">
                            {jobs.manual.map((job) => (
                                <div
                                    key={job.id}
                                    className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                                >
                                    <div>
                                        <h4 className="font-medium">{job.name}</h4>
                                        <p className="text-sm text-gray-500">{job.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleTrigger(job.id)}
                                        disabled={triggeringJob === job.id}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {triggeringJob === job.id ? (
                                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <PlayIcon className="w-4 h-4" />
                                        )}
                                        Execute
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Scheduled Tasks */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                            <ClockIcon className="w-5 h-5" />
                            Scheduled Tasks
                        </h3>
                        <div className="space-y-3">
                            {jobs.scheduled.map((job) => (
                                <div
                                    key={job.id}
                                    className="bg-white rounded-lg border border-gray-200 p-4"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-medium">{job.name}</h4>
                                            {job.is_paused && (
                                                <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                                                    Paused
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleTrigger(job.id)}
                                                disabled={triggeringJob === job.id}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                title="Trigger Now"
                                            >
                                                {triggeringJob === job.id ? (
                                                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <PlayIcon className="w-4 h-4" />
                                                )}
                                                Run Now
                                            </button>
                                            {job.is_paused ? (
                                                <button
                                                    onClick={() => handleResume(job.id)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                                    title="Resume"
                                                >
                                                    <PlayIcon className="w-4 h-4" />
                                                    Resume
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handlePause(job.id)}
                                                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                                                    title="Pause"
                                                >
                                                    <PauseIcon className="w-4 h-4" />
                                                    Pause
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-sm text-gray-500 flex items-center gap-4">
                                        <span>Schedule: {job.trigger}</span>
                                        <span>Next run: {formatDateTime(job.next_run_time)}</span>
                                    </div>
                                </div>
                            ))}
                            {jobs.scheduled.length === 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                    <p>No scheduled tasks found</p>
                                    <p className="text-sm">Scheduler may not be initialized</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Execution Logs */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-semibold">Recent Executions</h3>
                            <button
                                onClick={loadData}
                                disabled={loading}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                                title="Refresh"
                            >
                                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Task
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Trigger
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Started
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Duration
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Records
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="text-sm font-medium text-gray-900">
                                                    {log.job_name}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                    log.trigger_type === 'manual' 
                                                        ? 'bg-purple-100 text-purple-800' 
                                                        : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {log.trigger_type === 'manual' ? '手動' : '排程'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <StatusBadge status={log.status} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {formatDateTime(log.started_at)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {log.records_processed || 0}
                                            </td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                                                No execution logs yet
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ETLJobsManager;
