import React, { useState, useEffect } from 'react';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import API_BASE_URL, { authFetch } from '../../api/client';
import { formatLocalHour } from '../../utils/formatters';
import DateTimeHourSelector from '../../components/common/DateTimeHourSelector';

const SettingsManager = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [savedUrl, setSavedUrl] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    // Default period states
    const [defaultStartTime, setDefaultStartTime] = useState('');
    const [savedDefaultStartTime, setSavedDefaultStartTime] = useState('');
    const [savingPeriod, setSavingPeriod] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const [urlRes, periodRes] = await Promise.all([
                authFetch(`${API_BASE_URL}/api/admin/settings/youtube_url`),
                authFetch(`${API_BASE_URL}/api/admin/settings/default_start_time`),
            ]);
            const urlData = await urlRes.json();
            if (urlData.value) {
                setYoutubeUrl(urlData.value);
                setSavedUrl(urlData.value);
                setLastUpdated(urlData.updated_at);
            }

            const periodData = await periodRes.json();
            if (periodData.value) {
                const local = formatLocalHour(new Date(periodData.value));
                setDefaultStartTime(local);
                setSavedDefaultStartTime(local);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            setMessage({ type: 'error', text: '無法載入設定' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!youtubeUrl.trim()) {
            setMessage({ type: 'error', text: '請輸入 YouTube URL' });
            return;
        }

        // Basic YouTube URL validation
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;
        if (!youtubeRegex.test(youtubeUrl)) {
            setMessage({ type: 'error', text: '請輸入有效的 YouTube URL' });
            return;
        }

        try {
            setSaving(true);
            const response = await authFetch(`${API_BASE_URL}/api/admin/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    key: 'youtube_url',
                    value: youtubeUrl.trim(),
                    description: 'YouTube 直播 URL'
                })
            });

            const data = await response.json();

            if (data.success) {
                setSavedUrl(youtubeUrl);
                setLastUpdated(new Date().toISOString());
                setMessage({ type: 'success', text: '設定已儲存！Worker 將在 30 秒內更新。' });
            } else {
                setMessage({ type: 'error', text: data.message || '儲存失敗' });
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: '儲存失敗' });
        } finally {
            setSaving(false);
        }
    };

    const extractVideoId = (url) => {
        const match = url.match(/(?:v=|\/)?([a-zA-Z0-9_-]{11})/);
        return match ? match[1] : null;
    };

    const hasChanges = youtubeUrl !== savedUrl;
    const hasPeriodChanges = defaultStartTime !== savedDefaultStartTime;

    const handleSavePeriod = async () => {
        if (!defaultStartTime) {
            setMessage({ type: 'error', text: '請選擇預設開始時間' });
            return;
        }
        try {
            setSavingPeriod(true);
            const utcValue = new Date(defaultStartTime).toISOString();
            const response = await authFetch(`${API_BASE_URL}/api/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: 'default_start_time',
                    value: utcValue,
                    description: '預設時間區間開始時間 (UTC)'
                })
            });
            const data = await response.json();
            if (data.success) {
                setSavedDefaultStartTime(defaultStartTime);
                setMessage({ type: 'success', text: '預設時間區間已儲存！' });
            } else {
                setMessage({ type: 'error', text: data.message || '儲存失敗' });
            }
        } catch (error) {
            console.error('Error saving default period:', error);
            setMessage({ type: 'error', text: '儲存失敗' });
        } finally {
            setSavingPeriod(false);
        }
    };

    const handleClearPeriod = async () => {
        try {
            setSavingPeriod(true);
            const response = await authFetch(`${API_BASE_URL}/api/admin/settings/default_start_time`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Delete failed');
            setDefaultStartTime('');
            setSavedDefaultStartTime('');
            setMessage({ type: 'success', text: '預設時間區間已清除，各頁面將恢復預設行為。' });
        } catch (error) {
            console.error('Error clearing default period:', error);
            setMessage({ type: 'error', text: '清除失敗' });
        } finally {
            setSavingPeriod(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="mt-4 text-gray-500">載入設定中...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-800">
                    <Cog6ToothIcon className="w-6 h-6" />
                    <span>系統設定</span>
                </h2>
            </div>

            {message && (
                <div className={`p-4 rounded-lg ${message.type === 'success'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                    {message.text}
                </div>
            )}

            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-medium text-gray-800 mb-4">🎬 YouTube 直播設定</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            YouTube URL
                        </label>
                        <input
                            type="url"
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        />
                        {youtubeUrl && extractVideoId(youtubeUrl) && (
                            <p className="mt-2 text-sm text-gray-500">
                                Video ID: <code className="bg-gray-200 px-2 py-1 rounded">{extractVideoId(youtubeUrl)}</code>
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                            {lastUpdated && (
                                <span>
                                    上次更新: {new Date(lastUpdated).toLocaleString('zh-TW')}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving || !hasChanges}
                            className={`px-6 py-2 font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${hasChanges && !saving
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg cursor-pointer'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {saving ? '儲存中...' : '儲存設定'}
                        </button>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-800 mb-2">💡 說明</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• Worker 每 30 秒檢查一次設定變更</li>
                        <li>• 更新 URL 後，Worker 會自動重新連接新的直播</li>
                        <li>• 可輸入完整 YouTube URL 或 youtu.be 短網址</li>
                    </ul>
                </div>
            </div>

            {/* Default Period Setting */}
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                <h3 className="text-lg font-medium text-gray-800 mb-4">&#x23F0; 預設時間區間</h3>

                <div className="space-y-4">
                    <DateTimeHourSelector
                        label="預設開始時間"
                        value={defaultStartTime}
                        onChange={setDefaultStartTime}
                        max={formatLocalHour(new Date())}
                    />

                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                            {savedDefaultStartTime && (
                                <span>目前設定: {savedDefaultStartTime.replace('T', ' ')}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            {savedDefaultStartTime && (
                                <button
                                    onClick={handleClearPeriod}
                                    disabled={savingPeriod}
                                    className="px-4 py-2 font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-red-600 hover:bg-red-50 border border-red-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {savingPeriod ? '處理中...' : '清除設定'}
                                </button>
                            )}
                            <button
                                onClick={handleSavePeriod}
                                disabled={savingPeriod || !hasPeriodChanges || !defaultStartTime}
                                className={`px-6 py-2 font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${hasPeriodChanges && defaultStartTime && !savingPeriod
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg cursor-pointer'
                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                            >
                                {savingPeriod ? '儲存中...' : '儲存設定'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-800 mb-2">💡 說明</h4>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>• 設定後，Dashboard、趨勢分析、Playback 頁面會自動以此時間作為起始篩選</li>
                        <li>• 適合在直播開始時設定，讓所有頁面自動顯示開播後的資料</li>
                        <li>• 清除設定後，各頁面恢復原始預設行為</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SettingsManager;
