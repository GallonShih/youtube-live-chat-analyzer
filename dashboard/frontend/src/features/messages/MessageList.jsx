import React, { useState, useEffect } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
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

    const moneyText = message.message_type === 'paid_message' && message.money ? message.money.text : '';

    return (
        <div className="grid grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_minmax(120px,150px)] gap-4 text-sm border-b border-gray-200 py-2 hover:bg-gray-50">
            <span className="text-gray-500 whitespace-nowrap">{formatMessageTime(message.time)}</span>
            <span className="font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</span>
            <span className="text-gray-900 break-words">{renderMessageWithEmojis(message.message, message.emotes)}</span>
            <span className={`font-semibold ${moneyText ? 'text-green-600' : 'text-gray-400'}`}>{moneyText || '-'}</span>
        </div>
    );
};

const MessageList = ({ startTime, endTime, hasTimeFilter = false }) => {
    // Local UI state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
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
        if (hourlyStats.length === 0) return [];
        const dataMap = new Map();
        hourlyStats.forEach(item => dataMap.set(new Date(item.hour).getTime(), item.count));

        let minTime, maxTime;
        if (startTime && endTime) {
            minTime = new Date(startTime); minTime.setMinutes(0, 0, 0); minTime = minTime.getTime();
            maxTime = new Date(endTime); maxTime.setMinutes(0, 0, 0); maxTime = maxTime.getTime();
        } else {
            const times = Array.from(dataMap.keys());
            minTime = Math.min(...times);
            maxTime = Math.max(...times);
        }

        const result = [];
        for (let t = minTime; t <= maxTime; t += 3600000) {
            result.push({ x: t, y: dataMap.get(t) || 0 });
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
                ...(startTime && endTime ? { min: new Date(startTime).setMinutes(0, 0, 0), max: new Date(endTime).setMinutes(59, 59, 999) } : {})
            },
            y: { beginAtZero: true, title: { display: true, text: '訊息數' }, ticks: { stepSize: 1 } }
        }
    };

    const totalPages = Math.ceil(totalMessages / limit);

    if (loading && totalMessages === 0) {
        return <div className="mt-8 bg-white rounded-lg shadow p-6 flex justify-center py-8">載入中...</div>;
    }
    if (error) {
        return <div className="mt-8 bg-white rounded-lg shadow p-6 flex justify-center py-8 text-red-500">錯誤: {error}</div>;
    }

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">訊息列表</h2>
                {isRefreshing && (
                    <div className="flex items-center gap-1 text-sm text-blue-600 animate-pulse">
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        <span>更新中...</span>
                    </div>
                )}
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                {/* Filters */}
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">作者：</label>
                    <input
                        type="text"
                        value={localAuthorFilter}
                        onChange={(e) => setLocalAuthorFilter(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'author')}
                        onBlur={() => setAuthorFilter(localAuthorFilter)}
                        placeholder="輸入後按 Enter 搜尋..."
                        className="flex-1 px-3 py-2 border rounded text-sm"
                    />
                    {localAuthorFilter && <button onClick={() => { setLocalAuthorFilter(''); setAuthorFilter(''); }} className="px-3 py-2 text-sm bg-gray-200 rounded">清除</button>}
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">訊息：</label>
                    <input
                        type="text"
                        value={localMessageFilter}
                        onChange={(e) => setLocalMessageFilter(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, 'message')}
                        onBlur={() => setMessageFilter(localMessageFilter)}
                        placeholder="輸入後按 Enter 搜尋..."
                        className="flex-1 px-3 py-2 border rounded text-sm"
                    />
                    {localMessageFilter && <button onClick={() => { setLocalMessageFilter(''); setMessageFilter(''); }} className="px-3 py-2 text-sm bg-gray-200 rounded">清除</button>}
                </div>
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">訊息類型：</label>
                    <select value={paidMessageFilter} onChange={(e) => setPaidMessageFilter(e.target.value)} className="flex-1 px-3 py-2 border rounded text-sm">
                        <option value="all">全部</option>
                        <option value="paid_only">僅付費訊息</option>
                        <option value="non_paid_only">僅一般訊息</option>
                    </select>
                </div>
                {(authorFilter || messageFilter || paidMessageFilter !== 'all' || localAuthorFilter || localMessageFilter) && (
                    <div className="flex justify-end">
                        <button onClick={clearFilters} className="px-4 py-2 bg-gray-200 rounded text-sm">清除所有篩選</button>
                    </div>
                )}
            </div>

            <div className="mb-2 grid grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_minmax(120px,150px)] gap-4 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                <span>時間</span><span>作者</span><span>訊息</span><span>金額</span>
            </div>
            <div className="space-y-0 max-h-96 overflow-y-auto">
                {messages.length === 0 ? <div className="text-center py-8 text-gray-500">暫無訊息</div> : messages.map((msg) => <MessageRow key={msg.id} message={msg} />)}
            </div>

            <div className="flex items-center gap-4 mt-4 p-3 bg-gray-50 rounded">
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} disabled={hasTimeFilter} className="w-4 h-4 disabled:opacity-50" />
                    <span className="text-sm font-medium">自動刷新{hasTimeFilter && ' (已停用 - 時間範圍已固定)'}</span>
                </label>
                {autoRefresh && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm">每</span>
                        <input type="number" min="5" max="300" value={refreshInterval} onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 10)} className="w-16 px-2 py-1 border rounded text-center text-sm" />
                        <span className="text-sm">秒</span>
                    </div>
                )}
            </div>

            {totalMessages > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300">上一頁</button>
                    <form onSubmit={(e) => { e.preventDefault(); const p = parseInt(pageInput); if (p >= 1 && p <= totalPages) { setCurrentPage(p); setPageInput(''); } }} className="flex items-center gap-2">
                        <span className="text-sm">第</span>
                        <input type="number" min="1" max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} placeholder={currentPage.toString()} className="w-16 px-2 py-1 border rounded text-center text-sm" />
                        <span className="text-sm">/ {totalPages} 頁 (共 {totalMessages} 則訊息)</span>
                    </form>
                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage >= totalPages} className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300">下一頁</button>
                </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="h-64">
                    {statsLoading && hourlyStats.length === 0 ? <div className="flex justify-center h-full items-center">載入圖表中...</div> :
                        hourlyStats.length === 0 ? <div className="flex justify-center h-full items-center">無資料</div> :
                            <Line data={chartData} options={chartOptions} />}
                </div>
            </div>
        </div>
    );
};

export default MessageList;
