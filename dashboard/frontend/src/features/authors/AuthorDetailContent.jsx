import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowDownTrayIcon,
    ArrowTopRightOnSquareIcon,
    ClipboardDocumentIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline';
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
import { fetchAuthorMessages, fetchAuthorSummary, fetchAuthorTrend } from '../../api/chat';
import { fetchAllMessages, downloadAsCSV, downloadAsJSON, buildFilename, buildCopyText } from '../../utils/downloadMessages';
import { formatLocalHour, formatMessageTime, formatNumber } from '../../utils/formatters';

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

const PAGE_LIMIT = 20;

const toDateTimeLocal = (value) => {
    if (!value) return '';
    return formatLocalHour(new Date(value));
};

const buildRangeFromLocal = (startDate, endDate) => {
    const startTime = startDate ? new Date(startDate).toISOString() : null;
    let endTime = null;
    if (endDate) {
        const end = new Date(endDate);
        end.setMinutes(59, 59, 999);
        endTime = end.toISOString();
    }
    return { startTime, endTime };
};

const getAuthorImageUrl = (authorImages) => {
    if (!authorImages) return null;
    if (Array.isArray(authorImages) && authorImages.length > 0) {
        const order = ['32x32', '64x64', 'source'];
        for (const id of order) {
            const found = authorImages.find((item) => item?.id === id && item?.url);
            if (found) return found.url;
        }
        return authorImages.find((item) => item?.url)?.url || null;
    }
    if (typeof authorImages === 'object') {
        return authorImages.url || authorImages.src || null;
    }
    return null;
};

const getBadgeIconUrl = (badge) => {
    if (!badge) return null;
    if (badge.icon_url) return badge.icon_url;
    const icons = Array.isArray(badge.icons) ? badge.icons : [];
    const order = ['16x16', '32x32', 'source'];
    for (const id of order) {
        const found = icons.find((icon) => icon?.id === id && icon?.url);
        if (found) return found.url;
    }
    return icons.find((icon) => icon?.url)?.url || null;
};

const AuthorDetailContent = ({
    authorId,
    initialStartTime = null,
    initialEndTime = null,
    showOpenInNewPage = true,
}) => {
    const [tab, setTab] = useState('overview');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [appliedRange, setAppliedRange] = useState({ startTime: null, endTime: null });

    const [summary, setSummary] = useState(null);
    const [trend, setTrend] = useState([]);
    const [messages, setMessages] = useState([]);
    const [totalMessages, setTotalMessages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);

    const [summaryLoading, setSummaryLoading] = useState(true);
    const [trendLoading, setTrendLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(true);
    const [summaryError, setSummaryError] = useState(null);
    const [messagesError, setMessagesError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [copyingMessages, setCopyingMessages] = useState(false);
    const [copiedMessages, setCopiedMessages] = useState(false);
    const downloadMenuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
                setShowDownloadMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDownload = useCallback(async (format) => {
        setShowDownloadMenu(false);
        setDownloading(true);
        try {
            const allMessages = await fetchAllMessages(
                authorId,
                appliedRange.startTime,
                appliedRange.endTime,
            );
            const name = summary?.display_name || 'author';
            const filename = buildFilename(name, authorId, format);
            if (format === 'csv') {
                downloadAsCSV(allMessages, filename);
            } else {
                downloadAsJSON(allMessages, filename);
            }
        } catch (err) {
            console.error('Download failed:', err);
        } finally {
            setDownloading(false);
        }
    }, [authorId, appliedRange, summary]);

    const handleCopyMessages = useCallback(async () => {
        if (!navigator.clipboard?.writeText) return;
        setCopyingMessages(true);
        try {
            const allMessages = await fetchAllMessages(
                authorId,
                appliedRange.startTime,
                appliedRange.endTime,
            );
            const text = buildCopyText(allMessages);
            await navigator.clipboard.writeText(text);
            setCopiedMessages(true);
            setTimeout(() => setCopiedMessages(false), 1200);
        } catch (err) {
            console.error('Copy messages failed:', err);
        } finally {
            setCopyingMessages(false);
        }
    }, [authorId, appliedRange]);

    const renderMessageWithEmojis = (messageText, emotes) => {
        if (!messageText) return null;
        if (!emotes || emotes.length === 0) return <span>{messageText}</span>;

        const emoteMap = {};
        emotes.forEach((emote) => {
            if (emote.name && emote.images && emote.images.length > 0) {
                emoteMap[emote.name] = emote.images[0].url;
            }
        });

        const emojiPositions = [];
        Object.keys(emoteMap).forEach((emojiName) => {
            let searchPos = 0;
            while (true) {
                const pos = messageText.indexOf(emojiName, searchPos);
                if (pos === -1) break;
                emojiPositions.push({
                    start: pos,
                    end: pos + emojiName.length,
                    name: emojiName,
                    url: emoteMap[emojiName],
                });
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
                parts.push({
                    type: 'text',
                    content: messageText.substring(lastIndex, pos.start),
                    key: `text-${lastIndex}`,
                });
            }
            parts.push({
                type: 'emoji',
                name: pos.name,
                url: pos.url,
                key: `emoji-${pos.start}`,
            });
            lastIndex = pos.end;
        });

        if (lastIndex < messageText.length) {
            parts.push({
                type: 'text',
                content: messageText.substring(lastIndex),
                key: `text-${lastIndex}`,
            });
        }

        return (
            <span>
                {parts.map((part) =>
                    part.type === 'emoji' ? (
                        <img
                            key={part.key}
                            src={part.url}
                            alt={part.name}
                            className="inline-block align-middle mx-0.5"
                            style={{ height: '1.4em', width: 'auto' }}
                            loading="lazy"
                        />
                    ) : (
                        <span key={part.key}>{part.content}</span>
                    )
                )}
            </span>
        );
    };

    useEffect(() => {
        const now = new Date();
        const defaultStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const nextStart = initialStartTime ? toDateTimeLocal(initialStartTime) : formatLocalHour(defaultStart);
        const nextEnd = initialEndTime ? toDateTimeLocal(initialEndTime) : formatLocalHour(now);

        setSummary(null);
        setTrend([]);
        setMessages([]);
        setTotalMessages(0);
        setSummaryError(null);
        setMessagesError(null);
        setStartDate(nextStart);
        setEndDate(nextEnd);
        setAppliedRange(buildRangeFromLocal(nextStart, nextEnd));
        setCurrentPage(1);
    }, [authorId, initialStartTime, initialEndTime]);

    useEffect(() => {
        if (!authorId) return;

        let cancelled = false;

        const load = async () => {
            setSummaryLoading(true);
            setTrendLoading(true);
            setSummaryError(null);

            try {
                const [summaryData, trendData] = await Promise.all([
                    fetchAuthorSummary({
                        authorId,
                        startTime: appliedRange.startTime,
                        endTime: appliedRange.endTime,
                    }),
                    fetchAuthorTrend({
                        authorId,
                        startTime: appliedRange.startTime,
                        endTime: appliedRange.endTime,
                    }),
                ]);

                if (cancelled) return;
                setSummary(summaryData);
                setTrend(Array.isArray(trendData) ? trendData : []);
            } catch (err) {
                if (cancelled) return;
                setSummaryError(err.message || '載入作者資訊失敗');
            } finally {
                if (cancelled) return;
                setSummaryLoading(false);
                setTrendLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [authorId, appliedRange]);

    useEffect(() => {
        if (!authorId) return;

        let cancelled = false;

        const loadMessages = async () => {
            setMessagesLoading(true);

            try {
                const response = await fetchAuthorMessages({
                    authorId,
                    limit: PAGE_LIMIT,
                    offset: (currentPage - 1) * PAGE_LIMIT,
                    startTime: appliedRange.startTime,
                    endTime: appliedRange.endTime,
                });

                if (cancelled) return;
                setMessages(response.messages || []);
                setTotalMessages(response.total || 0);
                setMessagesError(null);
            } catch (err) {
                if (cancelled) return;
                setMessagesError(err.message || '載入訊息失敗');
            } finally {
                if (cancelled) return;
                setMessagesLoading(false);
            }
        };

        loadMessages();

        return () => {
            cancelled = true;
        };
    }, [authorId, currentPage, appliedRange]);

    const handleApplyRange = () => {
        const nextRange = buildRangeFromLocal(startDate, endDate);
        setAppliedRange(nextRange);
        setCurrentPage(1);
    };

    const handleResetRange = () => {
        const now = new Date();
        const nextStart = formatLocalHour(new Date(now.getTime() - 12 * 60 * 60 * 1000));
        const nextEnd = formatLocalHour(now);

        setStartDate(nextStart);
        setEndDate(nextEnd);
        setAppliedRange(buildRangeFromLocal(nextStart, nextEnd));
        setCurrentPage(1);
    };

    const handleCopyAuthorId = async () => {
        if (!authorId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(authorId);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch (copyError) {
            console.error('Copy author_id failed:', copyError);
        }
    };

    const trendDataFilled = useMemo(() => {
        const map = new Map((trend || []).map((row) => [new Date(row.hour).getTime(), row.count]));

        const rangeStart = appliedRange.startTime
            ? new Date(appliedRange.startTime)
            : new Date(Date.now() - 12 * 60 * 60 * 1000);
        rangeStart.setMinutes(0, 0, 0);

        const rangeEnd = appliedRange.endTime ? new Date(appliedRange.endTime) : new Date();
        rangeEnd.setMinutes(59, 59, 999);

        const points = [];
        const cursor = new Date(rangeStart);

        while (cursor <= rangeEnd) {
            const ts = cursor.getTime();
            points.push({ x: ts, y: map.get(ts) || 0 });
            cursor.setHours(cursor.getHours() + 1);
        }

        return points;
    }, [trend, appliedRange]);

    const trendChartData = {
        datasets: [{
            label: '訊息數量',
            data: trendDataFilled,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            tension: 0.3,
            fill: true,
            pointRadius: 2,
            pointHoverRadius: 4,
        }]
    };

    const trendChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: '每小時訊息趨勢', font: { size: 14, weight: 'bold' } },
        },
        scales: {
            x: {
                type: 'time',
                time: { unit: 'hour', displayFormats: { hour: 'MM/dd HH:mm' } },
                title: { display: true, text: '時間' },
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: '訊息數' },
                ticks: { stepSize: 1 },
            },
        },
    };

    const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_LIMIT));

    const openInNewPageHref = useMemo(() => {
        const params = new URLSearchParams();
        if (appliedRange.startTime) params.append('start_time', appliedRange.startTime);
        if (appliedRange.endTime) params.append('end_time', appliedRange.endTime);
        const query = params.toString();
        return `/authors/${encodeURIComponent(authorId)}${query ? `?${query}` : ''}`;
    }, [authorId, appliedRange]);
    const classifyPageHref = useMemo(() => {
        const params = new URLSearchParams();
        if (appliedRange.startTime) params.append('start_time', appliedRange.startTime);
        if (appliedRange.endTime) params.append('end_time', appliedRange.endTime);
        const query = params.toString();
        return `/authors/${encodeURIComponent(authorId)}/classify${query ? `?${query}` : ''}`;
    }, [authorId, appliedRange]);

    const authorImageUrl = getAuthorImageUrl(summary?.author_images);
    const error = summaryError || messagesError;

    if (!authorId) {
        return <div className="p-4 text-sm text-gray-500">尚未選擇作者</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                    {authorImageUrl ? (
                        <img
                            src={authorImageUrl}
                            alt={summary?.display_name || 'Author avatar'}
                            className="w-12 h-12 rounded-full object-cover border border-gray-200"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                            <UserCircleIcon className="w-7 h-7" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h2 className="text-xl font-bold text-gray-800 truncate">{summary?.display_name || 'Author'}</h2>
                            {Array.isArray(summary?.badges) && summary.badges.length > 0 && (
                                <div className="flex items-center gap-1 shrink-0">
                                    {summary.badges.map((badge, index) => {
                                        const iconUrl = getBadgeIconUrl(badge);
                                        if (!iconUrl) return null;
                                        return (
                                            <img
                                                key={`${badge.title || 'badge'}-${index}`}
                                                src={iconUrl}
                                                alt={badge.title || 'badge'}
                                                title={badge.title || 'badge'}
                                                className="w-4 h-4 rounded-sm"
                                                loading="lazy"
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="text-xs text-gray-500 break-all mt-1">author_id: {authorId}</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleCopyAuthorId}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                    >
                        <ClipboardDocumentIcon className="w-4 h-4 inline-block mr-1" />
                        {copied ? '已複製' : '複製 ID'}
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyMessages}
                        disabled={copyingMessages || !summary}
                        className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ClipboardDocumentIcon className="w-4 h-4 inline-block mr-1" />
                        {copiedMessages ? '已複製' : copyingMessages ? '複製中...' : '複製訊息'}
                    </button>
                    {showOpenInNewPage && (
                        <a
                            href={openInNewPageHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                            <ArrowTopRightOnSquareIcon className="w-4 h-4 inline-block mr-1" />
                            開新頁
                        </a>
                    )}
                    <div className="relative" ref={downloadMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowDownloadMenu((v) => !v)}
                            disabled={downloading || !summary}
                            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4 inline-block mr-1" />
                            {downloading ? '下載中...' : '下載'}
                        </button>
                        {showDownloadMenu && (
                            <div className="absolute right-0 mt-1 w-28 bg-white border border-gray-200 rounded shadow-lg z-10">
                                <button
                                    type="button"
                                    onClick={() => handleDownload('csv')}
                                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50"
                                >
                                    CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDownload('json')}
                                    className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50"
                                >
                                    JSON
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_auto] gap-2 items-center">
                    <input
                        type="datetime-local"
                        step="3600"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="px-3 py-2 border rounded text-sm"
                    />
                    <span className="text-center text-sm text-gray-500">→</span>
                    <input
                        type="datetime-local"
                        step="3600"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        max={formatLocalHour(new Date())}
                        className="px-3 py-2 border rounded text-sm"
                    />
                    <button
                        type="button"
                        onClick={handleApplyRange}
                        className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                        套用
                    </button>
                    <button
                        type="button"
                        onClick={handleResetRange}
                        className="px-3 py-2 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                    >
                        重設 12H
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3 rounded bg-red-50 text-red-600 text-sm">
                    錯誤: {error}
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">總訊息</div>
                    <div className="text-lg font-semibold text-gray-800">{summaryLoading ? '...' : formatNumber(summary?.total_messages || 0)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">付費訊息</div>
                    <div className="text-lg font-semibold text-gray-800">{summaryLoading ? '...' : formatNumber(summary?.paid_messages || 0)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">首次出現</div>
                    <div className="text-xs font-semibold text-gray-800">{summaryLoading ? '...' : formatMessageTime(summary?.first_seen)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="text-xs text-gray-500">最後出現</div>
                    <div className="text-xs font-semibold text-gray-800">{summaryLoading ? '...' : formatMessageTime(summary?.last_seen)}</div>
                </div>
            </div>

            <div className="flex gap-2 border-b border-gray-200">
                <button
                    type="button"
                    onClick={() => setTab('overview')}
                    className={`px-3 py-2 text-sm ${tab === 'overview' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}
                >
                    Overview
                </button>
                <button
                    type="button"
                    onClick={() => setTab('trend')}
                    className={`px-3 py-2 text-sm ${tab === 'trend' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}
                >
                    Trend
                </button>
                <button
                    type="button"
                    onClick={() => setTab('messages')}
                    className={`px-3 py-2 text-sm ${tab === 'messages' ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-600'}`}
                >
                    Messages
                </button>
            </div>

            {tab === 'overview' && (
                <div className="rounded-lg border border-gray-200 p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">所有 user name（依首次出現）</h3>
                    {summaryLoading ? (
                        <div className="text-sm text-gray-500">載入中...</div>
                    ) : summary?.aliases?.length ? (
                        <div className="space-y-2">
                            {summary.aliases.map((alias, index) => (
                                <div key={`${alias.name}-${index}`} className="flex items-center justify-between gap-3 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                    <div className="min-w-0">
                                        <div className="font-medium text-gray-800 truncate">{index + 1}. {alias.name}</div>
                                        <div className="text-xs text-gray-500">first: {formatMessageTime(alias.first_seen)}</div>
                                        <div className="text-xs text-gray-500">last: {formatMessageTime(alias.last_seen)}</div>
                                    </div>
                                    <div className="text-xs text-gray-600 whitespace-nowrap">{alias.message_count} 則</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500">無資料</div>
                    )}
                </div>
            )}

            {tab === 'trend' && (
                <div className="rounded-lg border border-gray-200 p-3">
                    <div className="h-64">
                        {trendLoading ? (
                            <div className="h-full flex items-center justify-center text-sm text-gray-500">載入中...</div>
                        ) : trendDataFilled.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-gray-500">無資料</div>
                        ) : (
                            <Line data={trendChartData} options={trendChartOptions} />
                        )}
                    </div>
                </div>
            )}

            {tab === 'messages' && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-gray-500">
                            進入獨立頁面進行訊息分類。
                        </div>
                        <a
                            href={classifyPageHref}
                            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                            分類 Message
                        </a>
                    </div>

                    {messagesLoading ? (
                        <div className="text-sm text-gray-500">載入中...</div>
                    ) : messages.length === 0 ? (
                        <div className="text-sm text-gray-500">無訊息</div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {messages.map((message) => {
                                const isPaid = message.message_type === 'paid_message' || message.message_type === 'ticker_paid_message_item';
                                const moneyText = isPaid && message.money ? message.money.text : '';
                                return (
                                <div key={message.id} className="border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-gray-700 truncate">{message.author || 'Unknown'}</div>
                                            {Array.isArray(message.badges) && message.badges.length > 0 && (
                                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                                    {message.badges.map((badge, index) => {
                                                        const iconUrl = getBadgeIconUrl(badge);
                                                        if (!iconUrl) return null;
                                                        return (
                                                            <img
                                                                key={`${message.id}-badge-${index}`}
                                                                src={iconUrl}
                                                                alt={badge.title || 'badge'}
                                                                title={badge.title || 'badge'}
                                                                className="w-3.5 h-3.5 rounded-sm"
                                                                loading="lazy"
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 whitespace-nowrap">{formatMessageTime(message.time)}</div>
                                    </div>
                                    <div className="text-sm text-gray-800 break-words mt-1">
                                        {renderMessageWithEmojis(message.message, message.emotes)}
                                    </div>
                                    {moneyText && (
                                        <div className="text-sm font-semibold text-green-600 mt-1">
                                            {moneyText}
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    )}

                    {totalMessages > 0 && (
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white disabled:bg-gray-300"
                            >
                                上一頁
                            </button>
                            <div className="text-xs text-gray-600">
                                第 {currentPage} / {totalPages} 頁（共 {totalMessages} 則）
                            </div>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white disabled:bg-gray-300"
                            >
                                下一頁
                            </button>
                        </div>
                    )}
                </div>
            )}

            {!summaryLoading && !summary && (
                <div className="p-4 border border-dashed border-gray-300 rounded text-sm text-gray-500 text-center">
                    <UserCircleIcon className="w-5 h-5 inline-block mr-1" />
                    找不到作者資料
                </div>
            )}
        </div>
    );
};

export default AuthorDetailContent;
