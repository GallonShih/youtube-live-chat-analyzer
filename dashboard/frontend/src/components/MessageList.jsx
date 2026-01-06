import { useState, useEffect } from 'react';

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

    return (
        <div className="grid grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)] gap-4 text-sm border-b border-gray-200 py-2 hover:bg-gray-50">
            <span className="text-gray-500 whitespace-nowrap">{formatTime(message.time)}</span>
            <span className="font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</span>
            <span className="text-gray-900 break-words">
                {renderMessageWithEmojis(message.message, message.emotes)}
            </span>
        </div>
    );
};

const MessageList = ({ startTime, endTime, hasTimeFilter = false }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalMessages, setTotalMessages] = useState(0);
    const [pageInput, setPageInput] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState(10);
    const [authorFilter, setAuthorFilter] = useState('');
    const [messageFilter, setMessageFilter] = useState('');
    const limit = 20;

    // Auto-refresh effect
    useEffect(() => {
        // Don't auto-refresh when time filter is set
        if (!autoRefresh || hasTimeFilter) return;

        const intervalId = setInterval(() => {
            fetchMessages();
        }, refreshInterval * 1000);

        return () => clearInterval(intervalId);
    }, [autoRefresh, refreshInterval, startTime, endTime, currentPage, authorFilter, messageFilter, hasTimeFilter]);

    useEffect(() => {
        setCurrentPage(1); // Reset to first page when time range or filters change
    }, [startTime, endTime, authorFilter, messageFilter]);

    useEffect(() => {
        fetchMessages();
    }, [startTime, endTime, currentPage, authorFilter, messageFilter]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const offset = (currentPage - 1) * limit;
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString()
            });

            if (startTime) params.append('start_time', startTime);
            if (endTime) params.append('end_time', endTime);
            if (authorFilter) params.append('author_filter', authorFilter);
            if (messageFilter) params.append('message_filter', messageFilter);

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
        }
    };

    const totalPages = Math.ceil(totalMessages / limit);

    if (loading) {
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
            <h2 className="text-2xl font-bold mb-4 text-gray-800">訊息列表</h2>

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

                {(authorFilter || messageFilter) && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => {
                                setAuthorFilter('');
                                setMessageFilter('');
                            }}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-sm rounded transition"
                        >
                            清除所有篩選
                        </button>
                    </div>
                )}
            </div>
            <div className="mb-2 grid grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)] gap-4 text-sm font-semibold text-gray-600 border-b-2 border-gray-300 pb-2">
                <span>時間</span>
                <span>作者</span>
                <span>訊息</span>
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
        </div>
    );
};

export default MessageList;

