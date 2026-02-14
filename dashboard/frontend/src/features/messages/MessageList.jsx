import React, { useState, useEffect } from 'react';
import { ArrowPathIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { SkeletonMessageList } from '../../components/common/Skeleton';
import Spinner from '../../components/common/Spinner';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { useChatMessages } from '../../hooks/useChatMessages';
import { formatMessageTime } from '../../utils/formatters';
import AuthorStatsPanel from './AuthorStatsPanel';

ChartJS.register(
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const MessageRow = ({ message }) => {
    const renderMessageWithEmojis = (messageText, emotes) => {
        if (!messageText) return null;
        if (!emotes || emotes.length === 0) {
            return <span>{messageText}</span>;
        }

        const emoteMap = {};
        emotes.forEach(e => {
            if (e.name && e.images && e.images.length > 0) {
                emoteMap[e.name] = e.images[0].url;
            }
        });

        const emojiPositions = [];
        Object.keys(emoteMap).forEach(emojiName => {
            let searchPos = 0;
            while (true) {
                const pos = messageText.indexOf(emojiName, searchPos);
                if (pos === -1) break;
                emojiPositions.push({ start: pos, end: pos + emojiName.length, name: emojiName, url: emoteMap[emojiName] });
                searchPos = pos + 1;
            }
        });

        if (emojiPositions.length === 0) return <span>{messageText}</span>;

        emojiPositions.sort((a, b) => a.start - b.start);

        const validPositions = [];
        let lastEnd = -1;
        for (const pos of emojiPositions) {
            if (pos.start >= lastEnd) {
                validPositions.push(pos);
                lastEnd = pos.end;
            }
        }

        const parts = [];
        let lastIndex = 0;

        validPositions.forEach((pos) => {
            if (pos.start > lastIndex) {
                parts.push({ type: 'text', content: messageText.substring(lastIndex, pos.start), key: `text-${lastIndex}` });
            }
            parts.push({ type: 'emoji', name: pos.name, url: pos.url, key: `emoji-${pos.start}` });
            lastIndex = pos.end;
        });

        if (lastIndex < messageText.length) {
            parts.push({ type: 'text', content: messageText.substring(lastIndex), key: `text-${lastIndex}` });
        }

        return (
            <span>
                {parts.map((part) =>
                    part.type === 'emoji' ? (
                        <img key={part.key} src={part.url} alt={part.name} className="inline-block align-middle mx-0.5" style={{ height: '1.5em', width: 'auto' }} loading="lazy" />
                    ) : (
                        <span key={part.key}>{part.content}</span>
                    )
                )}
            </span>
        );
    };

    const isPaid = message.message_type === 'paid_message' || message.message_type === 'ticker_paid_message_item';
    const moneyText = isPaid && message.money ? message.money.text : '';

    return (
        <>
            {/* Mobile: Card layout */}
            <div className="md:hidden border-b border-gray-200 py-3 px-2 hover:bg-gray-50 space-y-1">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-700 truncate max-w-[60%]">{message.author || 'Unknown'}</span>
                    <span className="text-xs text-gray-400">{formatMessageTime(message.time)}</span>
                </div>
                <div className="text-sm text-gray-900 break-words">{renderMessageWithEmojis(message.message, message.emotes)}</div>
                {moneyText && (
                    <div className="text-sm font-semibold text-green-600">{moneyText}</div>
                )}
            </div>
            {/* Desktop: Grid layout */}
            <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 text-sm border-b border-gray-200 py-2 hover:bg-gray-50">
                <span className="text-gray-500 whitespace-nowrap text-xs lg:text-sm">{formatMessageTime(message.time)}</span>
                <span className="font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</span>
                <span className="text-gray-900 break-words">{renderMessageWithEmojis(message.message, message.emotes)}</span>
                <span className={`font-semibold ${moneyText ? 'text-green-600' : 'text-gray-400'}`}>{moneyText || '-'}</span>
            </div>
        </>
    );
};

const MessageList = ({ startTime, endTime, hasTimeFilter = false }) => {
    // Local UI state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(10);

    // Filter states (Actual filters used for fetching)
    const [authorFilter, setAuthorFilter] = useState('');
    const [messageFilter, setMessageFilter] = useState('');
    const [paidMessageFilter, setPaidMessageFilter] = useState('all');

    // Input states (For typing)
    const [localAuthorFilter, setLocalAuthorFilter] = useState('');
    const [localMessageFilter, setLocalMessageFilter] = useState('');

    const limit = 20;

    const {
        messages,
        loading,
        isRefreshing,
        error,
        totalMessages,
        hourlyStats,
        statsLoading,
        getMessages,
        getHourlyStats,
        resetStats
    } = useChatMessages();

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter]);

    // Reset stats on filter change
    useEffect(() => {
        resetStats();
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter, resetStats]);

    // Auto-refresh logic
    useEffect(() => {
        if (!autoRefresh || hasTimeFilter) return;
        const intervalId = setInterval(() => {
            getMessages({ limit, offset: (currentPage - 1) * limit, startTime, endTime, authorFilter, messageFilter, paidMessageFilter });
            getHourlyStats({ startTime, endTime, authorFilter, messageFilter, paidMessageFilter });
        }, refreshInterval * 1000);
        return () => clearInterval(intervalId);
    }, [autoRefresh, refreshInterval, currentPage, startTime, endTime, authorFilter, messageFilter, paidMessageFilter, hasTimeFilter, getMessages, getHourlyStats]);

    // Initial load
    useEffect(() => {
        getMessages({ limit, offset: (currentPage - 1) * limit, startTime, endTime, authorFilter, messageFilter, paidMessageFilter, isInitial: true });
    }, [currentPage, startTime, endTime, authorFilter, messageFilter, paidMessageFilter, getMessages]);

    // Stats load
    useEffect(() => {
        getHourlyStats({ startTime, endTime, authorFilter, messageFilter, paidMessageFilter });
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter, getHourlyStats]);

    const handleKeyDown = (e, type) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            if (type === 'author') setAuthorFilter(localAuthorFilter);
            if (type === 'message') setMessageFilter(localMessageFilter);
        }
    };

    const clearFilters = () => {
        setAuthorFilter('');
        setLocalAuthorFilter('');
        setMessageFilter('');
        setLocalMessageFilter('');
        setPaidMessageFilter('all');
    };

    // Chart Data Preparation
    const filledChartData = (() => {
        const dataMap = new Map();
        hourlyStats.forEach(item => dataMap.set(new Date(item.hour).getTime(), item.count));

        let minTime, maxTime;

        // 判斷時間範圍
        if (startTime) {
            minTime = new Date(startTime);
            minTime.setMinutes(0, 0, 0);
            minTime = minTime.getTime();

            // 如果沒有 endTime，預設為當前時間
            if (endTime) {
                maxTime = new Date(endTime);
            } else {
                maxTime = new Date();
            }
            maxTime.setMinutes(59, 0, 0); // 確保涵蓋到當前小時的結尾
            maxTime = maxTime.getTime();
        } else {
            // 如果沒有指定時間範圍，預設顯示過去 12 小時
            const now = new Date();
            maxTime = now.getTime();
            minTime = now.getTime() - 12 * 60 * 60 * 1000;
        }

        // 處理邊界情況
        if (!minTime || !maxTime || minTime > maxTime) return [];

        const result = [];

        const current = new Date(minTime);
        current.setMinutes(0, 0, 0);
        current.setSeconds(0);
        current.setMilliseconds(0);

        const end = new Date(maxTime);

        while (current <= end) {
            const timestamp = current.getTime();
            result.push({ x: timestamp, y: dataMap.get(timestamp) || 0 });
            current.setHours(current.getHours() + 1);
        }

        return result;
    })();

    const chartData = {
        datasets: [{
            label: '訊息數量',
            data: filledChartData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 4,
        }]
    };

    // 計算有效的時間範圍 (用於 X 軸設定)
    const effectiveEndTime = endTime ? new Date(endTime) : new Date();
    effectiveEndTime.setMinutes(59, 59, 999);

    const effectiveStartTime = startTime
        ? new Date(startTime)
        : new Date(effectiveEndTime.getTime() - 12 * 60 * 60 * 1000); // Default 12 hours ago
    effectiveStartTime.setMinutes(0, 0, 0);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: { display: false },
            title: { display: true, text: '每小時訊息量', font: { size: 14, weight: 'bold' } },
            tooltip: {
                callbacks: {
                    title: (items) => {
                        if (!items.length) return '';
                        const date = new Date(items[0].raw.x);
                        return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00 - ${date.getHours().toString().padStart(2, '0')}:59`;
                    },
                    label: (item) => `訊息數: ${item.raw.y}`
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'hour', displayFormats: { hour: 'MM/dd HH:mm' } },
                title: { display: true, text: '時間' },
                min: effectiveStartTime.getTime(),
                max: effectiveEndTime.getTime()
            },
            y: { beginAtZero: true, title: { display: true, text: '訊息數' }, ticks: { stepSize: 1 } }
        }
    };

    const totalPages = Math.ceil(totalMessages / limit);



    return (
        <div className="mt-8 glass-card rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
                    <ChatBubbleLeftRightIcon className="w-7 h-7" />
                    <span>訊息列表</span>
                </h2>
                <div className="flex gap-2">
                    {isRefreshing && (
                        <div className="flex items-center gap-2 text-sm text-indigo-600 mr-2">
                            <Spinner size="sm" />
                            <span>更新中...</span>
                        </div>
                    )}
                    <button
                        onClick={() => {
                            getMessages({ limit, offset: (currentPage - 1) * limit, startTime, endTime, authorFilter, messageFilter, paidMessageFilter });
                            getHourlyStats({ startTime, endTime, authorFilter, messageFilter, paidMessageFilter });
                        }}
                        disabled={isRefreshing || loading || statsLoading}
                        className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
                        title="手動刷新資料"
                    >
                        <ArrowPathIcon className={`w-4 h-4 ${isRefreshing || statsLoading ? 'animate-spin' : ''}`} />
                        <span>刷新列表</span>
                    </button>
                </div>
            </div>

            {loading && totalMessages === 0 ? (
                <SkeletonMessageList count={10} />
            ) : error ? (
                <div className="flex justify-center py-8 text-red-500">錯誤: {error}</div>
            ) : (
                <>
                    <div className="mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg space-y-3">
                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <label className="text-sm font-medium sm:w-20">作者：</label>
                            <div className="flex flex-1 gap-2">
                                <input
                                    type="text"
                                    value={localAuthorFilter}
                                    onChange={(e) => setLocalAuthorFilter(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, 'author')}
                                    onBlur={() => setAuthorFilter(localAuthorFilter)}
                                    placeholder="輸入後按 Enter 搜尋..."
                                    className="flex-1 px-3 py-2 border rounded text-sm"
                                />
                                {localAuthorFilter && <button onClick={() => { setLocalAuthorFilter(''); setAuthorFilter(''); }} className="px-3 py-2 text-sm bg-gray-200 rounded cursor-pointer hover:bg-gray-300">清除</button>}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <label className="text-sm font-medium sm:w-20">訊息：</label>
                            <div className="flex flex-1 gap-2">
                                <input
                                    type="text"
                                    value={localMessageFilter}
                                    onChange={(e) => setLocalMessageFilter(e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, 'message')}
                                    onBlur={() => setMessageFilter(localMessageFilter)}
                                    placeholder="輸入後按 Enter 搜尋..."
                                    className="flex-1 px-3 py-2 border rounded text-sm"
                                />
                                {localMessageFilter && <button onClick={() => { setLocalMessageFilter(''); setMessageFilter(''); }} className="px-3 py-2 text-sm bg-gray-200 rounded cursor-pointer hover:bg-gray-300">清除</button>}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <label className="text-sm font-medium sm:w-20">訊息類型：</label>
                            <select value={paidMessageFilter} onChange={(e) => setPaidMessageFilter(e.target.value)} className="flex-1 px-3 py-2 border rounded text-sm">
                                <option value="all">全部</option>
                                <option value="paid_only">僅付費訊息</option>
                                <option value="non_paid_only">僅一般訊息</option>
                            </select>
                        </div>
                        {(authorFilter || messageFilter || paidMessageFilter !== 'all' || localAuthorFilter || localMessageFilter) && (
                            <div className="flex justify-end">
                                <button onClick={clearFilters} className="px-4 py-2 bg-gray-200 rounded text-sm cursor-pointer hover:bg-gray-300">清除所有篩選</button>
                            </div>
                        )}
                    </div>

                    {/* Desktop header - hidden on mobile */}
                    <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 mb-2 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                        <span>時間</span><span>作者</span><span>訊息</span><span>金額</span>
                    </div>
                    <div className="space-y-0 max-h-96 overflow-y-auto">
                        {messages.length === 0 ? <div className="text-center py-8 text-gray-500">暫無訊息</div> : messages.map((msg) => <MessageRow key={msg.id} message={msg} />)}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mt-4 p-3 bg-gray-50 rounded">
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} disabled={hasTimeFilter} className="w-4 h-4 disabled:opacity-50" />
                            <span className="text-xs sm:text-sm font-medium">自動刷新{hasTimeFilter && <span className="hidden sm:inline"> (已停用)</span>}</span>
                        </label>
                        {autoRefresh && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm">每</span>
                                <input type="number" min="5" max="300" value={refreshInterval} onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 10)} className="w-14 px-2 py-1 border rounded text-center text-sm" />
                                <span className="text-xs sm:text-sm">秒</span>
                            </div>
                        )}
                    </div>

                    {totalMessages > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-200">
                            <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer order-2 sm:order-1">上一頁</button>
                            <form onSubmit={(e) => { e.preventDefault(); const p = parseInt(pageInput); if (p >= 1 && p <= totalPages) { setCurrentPage(p); setPageInput(''); } }} className="flex items-center gap-2 order-1 sm:order-2">
                                <span className="text-sm">第</span>
                                <input type="number" min="1" max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} placeholder={currentPage.toString()} className="w-14 px-2 py-1 border rounded text-center text-sm" />
                                <span className="text-xs sm:text-sm">/ {totalPages} 頁 <span className="hidden sm:inline">(共 {totalMessages} 則)</span></span>
                            </form>
                            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="w-full sm:w-auto px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer order-3">下一頁</button>
                        </div>
                    )}

                    <div className="mt-6 pt-4 border-t border-gray-200">
                        <div className="h-48 sm:h-56 md:h-64">
                            {statsLoading && hourlyStats.length === 0 ? <div className="flex justify-center h-full items-center text-sm text-gray-500">載入圖表中...</div> :
                                filledChartData.length === 0 ? <div className="flex justify-center h-full items-center text-sm text-gray-500">無資料</div> :
                                    <Line data={chartData} options={chartOptions} />}
                        </div>
                    </div>

                    {/* Top Authors Bar Chart */}
                    <AuthorStatsPanel
                        startTime={startTime}
                        endTime={endTime}
                        authorFilter={authorFilter}
                        messageFilter={messageFilter}
                        paidMessageFilter={paidMessageFilter}
                        hasTimeFilter={hasTimeFilter}
                    />
                </>
            )}
        </div>
    );
};

export default MessageList;
