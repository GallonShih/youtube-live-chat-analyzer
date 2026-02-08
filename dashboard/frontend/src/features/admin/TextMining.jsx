import React, { useState } from 'react';
import {
    MagnifyingGlassIcon,
    ExclamationTriangleIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import DateTimeHourSelector from '../../components/common/DateTimeHourSelector';
import { formatLocalHour } from '../../utils/formatters';
import API_BASE_URL, { authFetch } from '../../api/client';

const TextMining = () => {
    // Filter state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [targetWord, setTargetWord] = useState('');

    // Result state
    const [results, setResults] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleAnalyze = async () => {
        // 1. 驗證輸入
        if (!startDate || !endDate || !targetWord.trim()) {
            setError('請填寫所有欄位');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 2. 時間格式轉換
            // DateTimeHourSelector 透過 onChange 回傳的是本地時間字串 (e.g. "2024-01-23T10:00:00")
            // 我們使用 new Date() 將其解析為 Date 物件，並轉為 ISO 字串 (UTC)
            // 這樣傳給後端時，就是帶有正確時區的標準時間格式 (e.g. "2024-01-23T02:00:00.000Z")
            // 避免因為時區差異導致查詢範圍錯誤 (DB 儲存的是 UTC 時間)
            const isoStartTime = new Date(startDate).toISOString();
            const isoEndTime = new Date(endDate).toISOString();

            // 3. 呼叫後端 API
            // Method: POST
            // Endpoint: /api/text-mining/analyze
            const response = await authFetch(`${API_BASE_URL}/api/text-mining/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    start_time: isoStartTime,
                    end_time: isoEndTime,
                    target_word: targetWord.trim(),
                }),
            });

            // 4. 錯誤處理
            // 如果 API 回傳非 200 OK，拋出錯誤
            if (!response.ok) {
                // 嘗試讀取錯誤訊息 (可能是 JSON 或純文字)
                const contentType = response.headers.get("content-type");
                let errorMessage = `API Error: ${response.status}`;
                if (contentType && contentType.includes("application/json")) {
                    const errorJson = await response.json();
                    errorMessage = errorJson.detail || errorMessage;
                }
                throw new Error(errorMessage);
            }

            // 5. 解析資料
            const data = await response.json();
            setResults(data);
        } catch (err) {
            console.error('Analysis failed:', err);
            setError(err.message || '分析發生錯誤，請稍後再試');
        } finally {
            setIsLoading(false);
        }
    };

    const renderExtensionResults = (data, direction) => {
        const IconComponent = direction === 'forward' ? ArrowRightIcon : ArrowLeftIcon;
        const label = direction === 'forward' ? '向後延伸' : '向前延伸';

        return (
            <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    <IconComponent className="w-4 h-4" />
                    <span>{label}</span>
                </h4>
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(length => {
                        const items = data[direction]?.[String(length)] || [];
                        return (
                            <div key={length} className="flex items-start gap-2 text-sm">
                                <span className="font-medium text-gray-500 w-10 shrink-0">{length}字:</span>
                                <div className="flex flex-wrap gap-1">
                                    {items.length > 0 ? (
                                        items.map((item, idx) => (
                                            <span
                                                key={idx}
                                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                            >
                                                {item.text}
                                                <span className="ml-1 text-blue-600">({item.count})</span>
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-400">無資料</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderMessageTypeResults = (data, title, emoji) => {
        return (
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span>{emoji}</span> {title}
                </h3>
                {renderExtensionResults(data, 'forward')}
                <hr className="my-3 border-gray-200" />
                {renderExtensionResults(data, 'backward')}
            </div>
        );
    };

    return (
        <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-gray-800 mb-4">
                <MagnifyingGlassIcon className="w-6 h-6" />
                <span>文字探勘 Text Mining</span>
            </h2>
            <p className="text-sm text-gray-600 mb-6">
                輸入目標詞，分析該詞在訊息中前後延伸 1~5 個字的高頻組合。
            </p>

            {/* Filter Panel */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
                <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-12 md:col-span-3">
                        <DateTimeHourSelector
                            label="開始時間"
                            value={startDate}
                            onChange={setStartDate}
                            max={formatLocalHour(new Date())}
                        />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                        <DateTimeHourSelector
                            label="結束時間"
                            value={endDate}
                            onChange={setEndDate}
                            max={formatLocalHour(new Date())}
                        />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">目標詞</label>
                        <input
                            type="text"
                            value={targetWord}
                            onChange={(e) => setTargetWord(e.target.value)}
                            placeholder="輸入要分析的詞"
                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                        <button
                            onClick={handleAnalyze}
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            {isLoading ? '分析中...' : '開始分析'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Results */}
            {results && (
                <>
                    {/* Stats */}
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex flex-wrap gap-6 text-sm">
                            <div>
                                <span className="text-gray-600">總訊息數：</span>
                                <span className="font-bold text-gray-800">{results.stats.total_messages.toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-600">原始訊息匹配：</span>
                                <span className="font-bold text-green-700">{results.stats.matched_original.toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-600">處理後訊息匹配：</span>
                                <span className="font-bold text-purple-700">{results.stats.matched_processed.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Two Column Results */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {renderMessageTypeResults(results.original_message, '原始訊息', '📝')}
                        {renderMessageTypeResults(results.processed_message, '處理後訊息', '🔧')}
                    </div>
                </>
            )}

            {/* Empty State */}
            {!results && !isLoading && !error && (
                <div className="text-center py-12 text-gray-500">
                    <MagnifyingGlassIcon className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                    <p>請設定時間範圍和目標詞，然後點擊「開始分析」</p>
                </div>
            )}
        </div>
    );
};

export default TextMining;
