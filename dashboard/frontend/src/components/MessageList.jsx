import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
    const formatTime = (utcTime) => {
        if (!utcTime) return 'N/A';
        const date = new Date(utcTime + 'Z'); // Ensure UTC parsing
        // Convert to +8 timezone (Asia/Taipei)
        const options = {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        return new Intl.DateTimeFormat('zh-TW', options).format(date);
    };

    const renderMessageWithEmojis = (messageText, emotes) => {
        if (!messageText) return null;
        if (!emotes || emotes.length === 0) {
            return <span>{messageText}</span>;
        }

        // Create a map of emoji names to URLs
        // DB stores: {name: ":emoji:", images: [{url: "https://..."}]}
        const emoteMap = {};
        emotes.forEach(e => {
            if (e.name && e.images && e.images.length > 0) {
                emoteMap[e.name] = e.images[0].url;
            }
        });

        // Find all positions of valid emojis in the message
        // Only search for emoji names that actually exist in emoteMap
        const emojiPositions = [];

        Object.keys(emoteMap).forEach(emojiName => {
            let searchPos = 0;
            while (true) {
                const pos = messageText.indexOf(emojiName, searchPos);
                if (pos === -1) break;

                emojiPositions.push({
                    start: pos,
                    end: pos + emojiName.length,
                    name: emojiName,
                    url: emoteMap[emojiName]
                });

                searchPos = pos + 1; // Move forward to find overlapping matches
            }
        });

        // If no emojis found, return plain text
        if (emojiPositions.length === 0) {
            return <span>{messageText}</span>;
        }

        // Sort positions by start index
        emojiPositions.sort((a, b) => a.start - b.start);

        // Remove overlapping emojis (keep the first occurrence)
        const validPositions = [];
        let lastEnd = -1;
        for (const pos of emojiPositions) {
            if (pos.start >= lastEnd) {
                validPositions.push(pos);
                lastEnd = pos.end;
            }
        }

        // Build parts array
        const parts = [];
        let lastIndex = 0;

        validPositions.forEach((pos, idx) => {
            // Add text before emoji
            if (pos.start > lastIndex) {
                parts.push({
                    type: 'text',
                    content: messageText.substring(lastIndex, pos.start),
                    key: `text-${lastIndex}`
                });
            }

            // Add emoji
            parts.push({
                type: 'emoji',
                name: pos.name,
                url: pos.url,
                key: `emoji-${pos.start}`
            });

            lastIndex = pos.end;
        });

        // Add remaining text
        if (lastIndex < messageText.length) {
            parts.push({
                type: 'text',
                content: messageText.substring(lastIndex),
                key: `text-${lastIndex}`
            });
        }

        // Render parts
        return (
            <span>
                {parts.map((part) =>
                    part.type === 'emoji' ? (
                        <img
                            key={part.key}
                            src={part.url}
                            alt={part.name}
                            className="inline-block align-middle mx-0.5"
                            style={{ height: '1.5em', width: 'auto' }}
                            loading="lazy"
                        />
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
            <span className="text-gray-500 whitespace-nowrap">{formatTime(message.time)}</span>
            <span className="font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</span>
            <span className="text-gray-900 break-words">
                {renderMessageWithEmojis(message.message, message.emotes)}
            </span>
            <span className={`font-semibold ${moneyText ? 'text-green-600' : 'text-gray-400'}`}>
                {moneyText || '-'}
            </span>
        </div>
    );
};

const MessageList = ({ startTime, endTime, hasTimeFilter = false }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalMessages, setTotalMessages] = useState(0);
    const [pageInput, setPageInput] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(10);
    const [authorFilter, setAuthorFilter] = useState('');
    const [messageFilter, setMessageFilter] = useState('');
    const [paidMessageFilter, setPaidMessageFilter] = useState('all');
    const [hourlyStats, setHourlyStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const limit = 20;

    // Ref for Chart.js instance - enables direct updates without full re-render
    const chartRef = useRef(null);
    // Track last fetched hour for delta polling
    const lastFetchedHourRef = useRef(null);
    // Track if initial stats load has completed (use ref to avoid async timing issues)
    const hasInitialStatsLoadedRef = useRef(false);

    // Auto-refresh effect
    useEffect(() => {
        // Don't auto-refresh when time filter is set
        if (!autoRefresh || hasTimeFilter) return;

        const intervalId = setInterval(() => {
            fetchMessages();
            fetchHourlyStats();
        }, refreshInterval * 1000);

        return () => clearInterval(intervalId);
    }, [autoRefresh, refreshInterval, startTime, endTime, currentPage, authorFilter, messageFilter, paidMessageFilter, hasTimeFilter]);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page when time range or filters change
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter]);

    useEffect(() => {
        fetchMessages();
    }, [startTime, endTime, currentPage, authorFilter, messageFilter, paidMessageFilter]);

    // Separate effect for hourly stats - only when filters change, NOT on pagination
    useEffect(() => {
        fetchHourlyStats();
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter]);

    const fetchMessages = async () => {
        try {
            if (isInitialLoad) {
                setLoading(true);
            } else {
                setIsRefreshing(true);
            }
            const offset = (currentPage - 1) * limit;
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString()
            });

            // Default to 12 hours ago if no time filter is set
            let effectiveStartTime = startTime;
            if (!effectiveStartTime && !endTime) {
                effectiveStartTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            }

            if (effectiveStartTime) params.append('start_time', effectiveStartTime);
            if (endTime) params.append('end_time', endTime);
            if (authorFilter) params.append('author_filter', authorFilter);
            if (messageFilter) params.append('message_filter', messageFilter);
            if (paidMessageFilter !== 'all') params.append('paid_message_filter', paidMessageFilter);

            const response = await fetch(`http://localhost:8000/api/chat/messages?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setMessages(data.messages || []);
            setTotalMessages(data.total || 0);
            setError(null);
        } catch (err) {
            console.error('Error fetching messages:', err);
            setError(err.message);
        } finally {
            setLoading(false);
            setIsInitialLoad(false);
            setIsRefreshing(false);
        }
    };

    const fetchHourlyStats = async (forceFullFetch = false) => {
        try {
            // Only show loading indicator on initial load
            if (!hasInitialStatsLoadedRef.current) {
                setStatsLoading(true);
            }

            const params = new URLSearchParams();

            // Default to 12 hours ago if no time filter is set (for initial/full fetch)
            let effectiveStartTime = startTime;
            const isRealTime = !startTime && !endTime;
            if (isRealTime && (forceFullFetch || !hasInitialStatsLoadedRef.current)) {
                effectiveStartTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            }

            if (effectiveStartTime) params.append('start_time', effectiveStartTime);
            if (endTime) params.append('end_time', endTime);
            if (authorFilter) params.append('author_filter', authorFilter);
            if (messageFilter) params.append('message_filter', messageFilter);
            if (paidMessageFilter !== 'all') params.append('paid_message_filter', paidMessageFilter);

            // Delta polling: use 'since' parameter for subsequent fetches
            // Only applies when not using time filters (real-time mode)
            const useIncrementalFetch = !forceFullFetch &&
                hasInitialStatsLoadedRef.current &&
                isRealTime &&
                lastFetchedHourRef.current;

            if (useIncrementalFetch) {
                params.append('since', lastFetchedHourRef.current);
            }

            const response = await fetch(`http://localhost:8000/api/chat/message-stats?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.length === 0) return; // No new data

            // Update last fetched hour reference
            lastFetchedHourRef.current = data[data.length - 1].hour;

            if (!hasInitialStatsLoadedRef.current || forceFullFetch || startTime || endTime) {
                // Full replacement for initial load or when filters are active
                setHourlyStats(data || []);
                hasInitialStatsLoadedRef.current = true;
            } else {
                // Incremental merge using Map for efficiency
                setHourlyStats(prev => {
                    const map = new Map(prev.map(item => [item.hour, item.count]));

                    // Update or add new data points
                    data.forEach(item => map.set(item.hour, item.count));

                    // Prune old data if in real-time mode (keep only last 12 hours)
                    if (isRealTime) {
                        const cutOff = new Date(Date.now() - 12 * 60 * 60 * 1000).getTime();
                        for (const [key, val] of map.entries()) {
                            // key is ISO string
                            const ts = new Date(key.endsWith('Z') ? key : key + 'Z').getTime();
                            if (ts < cutOff) {
                                map.delete(key);
                            }
                        }
                    }

                    // Convert back to sorted array
                    const merged = Array.from(map.entries())
                        .map(([hour, count]) => ({ hour, count }))
                        .sort((a, b) => new Date(a.hour) - new Date(b.hour));

                    return merged;
                });

                // Direct Chart.js update for smooth animation (if chart exists)
                if (chartRef.current) {
                    chartRef.current.update('active');
                }
            }

        } catch (err) {
            console.error('Error fetching hourly stats:', err);
        } finally {
            setStatsLoading(false);
        }
    };

    // Reset incremental state when filters change
    useEffect(() => {
        hasInitialStatsLoadedRef.current = false;
        lastFetchedHourRef.current = null;
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter]);

    // Fill missing hours with 0 and prepare chart data
    const filledChartData = useMemo(() => {
        if (hourlyStats.length === 0) return [];

        // Build a map of existing data
        const dataMap = new Map();
        hourlyStats.forEach(item => {
            const ts = new Date(item.hour.endsWith('Z') ? item.hour : item.hour + 'Z').getTime();
            dataMap.set(ts, item.count);
        });

        // Determine time range
        let minTime, maxTime;
        if (startTime && endTime) {
            // Use filter time range
            minTime = new Date(startTime);
            minTime.setMinutes(0, 0, 0);
            minTime = minTime.getTime();

            maxTime = new Date(endTime);
            maxTime.setMinutes(0, 0, 0);
            maxTime = maxTime.getTime();
        } else {
            // Use data range
            const times = Array.from(dataMap.keys());
            minTime = Math.min(...times);
            maxTime = Math.max(...times);
        }

        // Fill in missing hours
        const result = [];
        const oneHour = 60 * 60 * 1000;
        for (let t = minTime; t <= maxTime; t += oneHour) {
            result.push({
                x: t,
                y: dataMap.get(t) || 0
            });
        }

        return result;
    }, [hourlyStats, startTime, endTime]);

    const chartData = {
        datasets: [
            {
                label: '訊息數量',
                data: filledChartData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
            }
        ]
    };

    // Calculate chart axis bounds based on time filter
    const chartAxisBounds = useMemo(() => {
        if (startTime && endTime) {
            const minDate = new Date(startTime);
            minDate.setMinutes(0, 0, 0);
            const maxDate = new Date(endTime);
            maxDate.setMinutes(59, 59, 999);
            return { min: minDate.getTime(), max: maxDate.getTime() };
        }
        return {};
    }, [startTime, endTime]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: '每小時訊息量',
                font: { size: 14, weight: 'bold' }
            },
            tooltip: {
                callbacks: {
                    title: (items) => {
                        if (!items.length) return '';
                        const date = new Date(items[0].raw.x);
                        const pad = n => n.toString().padStart(2, '0');
                        // Format as time range: HH:00 - HH:59
                        const hour = date.getHours();
                        const month = date.getMonth() + 1;
                        const day = date.getDate();
                        return `${pad(month)}/${pad(day)} ${pad(hour)}:00 - ${pad(hour)}:59`;
                    },
                    label: (item) => `訊息數: ${item.raw.y}`
                }
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'hour',
                    displayFormats: { hour: 'MM/dd HH:mm' }
                },
                title: { display: true, text: '時間' },
                ...chartAxisBounds
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: '訊息數' },
                ticks: { stepSize: 1 }
            }
        }
    };

    const totalPages = Math.ceil(totalMessages / limit);

    if (loading && isInitialLoad) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>
                <div className="flex justify-center items-center py-8">
                    <div className="text-gray-500">載入中...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>
                <div className="flex justify-center items-center py-8">
                    <div className="text-red-500">錯誤: {error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">訊息列表</h2>
                {isRefreshing && (
                    <div className="text-sm text-blue-600 animate-pulse">
                        🔄 更新中...
                    </div>
                )}
            </div>

            {/* Filter Section */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">作者：</label>
                    <input
                        type="text"
                        value={authorFilter}
                        onChange={(e) => setAuthorFilter(e.target.value)}
                        placeholder="搜尋作者名稱..."
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {authorFilter && (
                        <button
                            onClick={() => setAuthorFilter('')}
                            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition"
                        >
                            清除
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">訊息：</label>
                    <input
                        type="text"
                        value={messageFilter}
                        onChange={(e) => setMessageFilter(e.target.value)}
                        placeholder="搜尋訊息內容（支援 emoji）..."
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {messageFilter && (
                        <button
                            onClick={() => setMessageFilter('')}
                            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition"
                        >
                            清除
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium w-20">訊息類型：</label>
                    <select
                        value={paidMessageFilter}
                        onChange={(e) => setPaidMessageFilter(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">全部</option>
                        <option value="paid_only">僅付費訊息</option>
                        <option value="non_paid_only">僅一般訊息</option>
                    </select>
                </div>

                {(authorFilter || messageFilter || paidMessageFilter !== 'all') && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => {
                                setAuthorFilter('');
                                setMessageFilter('');
                                setPaidMessageFilter('all');
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-sm rounded transition"
                        >
                            清除所有篩選
                        </button>
                    </div>
                )}
            </div>
            <div className="mb-2 grid grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_minmax(120px,150px)] gap-4 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                <span>時間</span>
                <span>作者</span>
                <span>訊息</span>
                <span>金額</span>
            </div>
            <div className="space-y-0 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">暫無訊息</div>
                ) : (
                    messages.map((msg) => <MessageRow key={msg.id} message={msg} />)
                )}
            </div>

            {/* Auto-Refresh Controls */}
            <div className="flex items-center gap-4 mt-4 p-3 bg-gray-50 rounded">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        disabled={hasTimeFilter}
                        className="w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-medium">自動刷新{hasTimeFilter && ' (已停用 - 時間範圍已固定)'}</span>
                </label>

                {autoRefresh && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm">每</span>
                        <input
                            type="number"
                            min="5"
                            max="300"
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 10)}
                            className="w-16 px-2 py-1 border rounded text-center text-sm"
                        />
                        <span className="text-sm">秒</span>
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {totalMessages > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <button
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        上一頁
                    </button>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const pageNum = parseInt(pageInput);
                            if (pageNum >= 1 && pageNum <= totalPages) {
                                setCurrentPage(pageNum);
                                setPageInput('');
                            } else {
                                alert(`請輸入 1 到 ${totalPages} 之間的頁數`);
                            }
                        }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-sm text-gray-600">第</span>
                        <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            placeholder={currentPage.toString()}
                            className="w-16 px-2 py-1 border rounded text-center text-sm"
                        />
                        <span className="text-sm text-gray-600">/ {totalPages} 頁 (共 {totalMessages} 則訊息)</span>
                    </form>

                    <button
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        下一頁
                    </button>
                </div>
            )}

            {/* Hourly Message Chart */}
            <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="h-64">
                    {statsLoading ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="text-gray-500">載入圖表中...</div>
                        </div>
                    ) : hourlyStats.length === 0 ? (
                        <div className="flex justify-center items-center h-full">
                            <div className="text-gray-500">無資料可顯示</div>
                        </div>
                    ) : (
                        <Line ref={chartRef} data={chartData} options={chartOptions} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MessageList;

