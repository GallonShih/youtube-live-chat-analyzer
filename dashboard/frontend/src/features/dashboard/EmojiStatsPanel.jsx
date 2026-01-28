import React, { useState, useEffect } from 'react';
import { useEmojiStats } from '../../hooks/useEmojiStats';

const EmojiRow = ({ emoji }) => {
    return (
        <div className="grid grid-cols-[80px_1fr_120px_120px] gap-4 text-sm border-b border-gray-200 py-3 hover:bg-gray-50 items-center">
            <span className="text-center">
                {emoji.is_youtube_emoji && emoji.image_url ? (
                    <img
                        src={emoji.image_url}
                        alt={emoji.name}
                        className="inline-block mx-auto"
                        style={{ height: '24px', width: 'auto' }}
                        loading="lazy"
                    />
                ) : (
                    <span className="text-2xl">{emoji.name}</span>
                )}
            </span>
            <span className="text-gray-700 font-mono text-xs truncate" title={emoji.name}>{emoji.name}</span>
            <span className="text-center font-semibold text-gray-800">{emoji.message_count.toLocaleString()}</span>
            <span className="text-center">
                {emoji.is_youtube_emoji ? (
                    <span className="inline-flex items-center px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                        YouTube
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        Unicode
                    </span>
                )}
            </span>
        </div>
    );
};

const EmojiStatsPanel = ({ startTime, endTime, hasTimeFilter = false }) => {
    // UI State
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(10);

    // Filter state
    const [filter, setFilter] = useState('');
    const [localFilter, setLocalFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    const limit = 20;

    const { emojis, loading, isRefreshing, error, total, getEmojis } = useEmojiStats();

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [startTime, endTime, filter, typeFilter]);

    // Debounce search filter
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilter(localFilter);
        }, 500);
        return () => clearTimeout(timer);
    }, [localFilter]);

    // Auto-refresh logic
    useEffect(() => {
        if (!autoRefresh || hasTimeFilter) return;
        const intervalId = setInterval(() => {
            getEmojis({ limit, offset: (currentPage - 1) * limit, startTime, endTime, filter, typeFilter });
        }, refreshInterval * 1000);
        return () => clearInterval(intervalId);
    }, [autoRefresh, refreshInterval, currentPage, startTime, endTime, filter, typeFilter, hasTimeFilter, getEmojis]);

    // Initial load and filter/page change
    useEffect(() => {
        getEmojis({ limit, offset: (currentPage - 1) * limit, startTime, endTime, filter, typeFilter, isInitial: true });
    }, [currentPage, startTime, endTime, filter, typeFilter, getEmojis]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            setFilter(localFilter);
        }
    };

    const clearFilter = () => {
        setFilter('');
        setLocalFilter('');
    };

    const totalPages = Math.ceil(total / limit);

    if (loading && total === 0) {
        return <div className="mt-8 bg-white rounded-lg shadow p-6 flex justify-center py-8">載入中...</div>;
    }
    if (error) {
        return <div className="mt-8 bg-white rounded-lg shadow p-6 flex justify-center py-8 text-red-500">錯誤: {error}</div>;
    }

    return (
        <div className="mt-8 bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">😀 表情統計</h2>
                {isRefreshing && <div className="text-sm text-blue-600 animate-pulse">🔄 更新中...</div>}
            </div>

            {/* Filter */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <label className="text-sm font-medium whitespace-nowrap">搜尋：</label>
                        <input
                            type="text"
                            value={localFilter}
                            onChange={(e) => setLocalFilter(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="輸入關鍵字搜尋..."
                            className="flex-1 px-3 py-2 border rounded text-sm w-full"
                        />
                        {localFilter && <button onClick={clearFilter} className="px-3 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300">清除</button>}
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">類型：</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="px-3 py-2 border rounded text-sm bg-white"
                        >
                            <option value="all">全部</option>
                            <option value="youtube">YouTube</option>
                            <option value="unicode">Unicode</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table Header */}
            <div className="mb-2 grid grid-cols-[80px_1fr_120px_120px] gap-4 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                <span className="text-center">表情</span>
                <span>代碼</span>
                <span className="text-center">訊息數</span>
                <span className="text-center">類型</span>
            </div>

            {/* Table Body */}
            <div className="space-y-0 max-h-96 overflow-y-auto">
                {emojis.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">暫無表情資料</div>
                ) : (
                    emojis.map((emoji, index) => <EmojiRow key={`${emoji.name}-${emoji.is_youtube_emoji}-${index}`} emoji={emoji} />)
                )}
            </div>

            {/* Auto-refresh controls */}
            <div className="flex items-center gap-4 mt-4 p-3 bg-gray-50 rounded">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        disabled={hasTimeFilter}
                        className="w-4 h-4 disabled:opacity-50"
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

            {/* Pagination */}
            {total > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                    <button
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                    >
                        上一頁
                    </button>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const p = parseInt(pageInput);
                            if (p >= 1 && p <= totalPages) {
                                setCurrentPage(p);
                                setPageInput('');
                            }
                        }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-sm">第</span>
                        <input
                            type="number"
                            min="1"
                            max={totalPages}
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            placeholder={currentPage.toString()}
                            className="w-16 px-2 py-1 border rounded text-center text-sm"
                        />
                        <span className="text-sm">/ {totalPages} 頁 (共 {total.toLocaleString()} 種表情)</span>
                    </form>
                    <button
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                    >
                        下一頁
                    </button>
                </div>
            )}
        </div>
    );
};

export default EmojiStatsPanel;
