import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../api/client';

const SettingsManager = () => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [savedUrl, setSavedUrl] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/api/admin/settings/youtube_url`);
            const data = await response.json();

            if (data.value) {
                setYoutubeUrl(data.value);
                setSavedUrl(data.value);
                setLastUpdated(data.updated_at);
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
            const response = await fetch(`${API_BASE_URL}/api/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="text-gray-500">載入設定中...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">⚙️ 系統設定</h2>
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
                            className={`px-6 py-2 font-semibold rounded-lg transition-all duration-200 ${hasChanges && !saving
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            {saving ? '儲存中...' : '💾 儲存設定'}
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
        </div>
    );
};

export default SettingsManager;
