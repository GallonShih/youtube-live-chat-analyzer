import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Navigation from '../../components/common/Navigation';
import { fetchAuthorSummary, fetchChatMessages } from '../../api/chat';
import { downloadAsJSON } from '../../utils/downloadMessages';
import { formatMessageTime } from '../../utils/formatters';

const CONTEXT_WINDOW_SIZE = 50;
const CHAT_BATCH_SIZE = 500;

const escapeCSV = (value) => {
    if (value == null) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const downloadLabeledMessagesAsCSV = (messages, filename) => {
    const headers = ['time', 'author', 'author_id', 'message_type', 'message', 'money_currency', 'money_amount', 'classification_label'];
    const rows = messages.map((msg) => {
        const currency = msg.money?.currency || '';
        const amount = msg.money?.amount != null ? msg.money.amount : '';
        return [
            msg.time || '',
            msg.author || '',
            msg.author_id || '',
            msg.message_type || '',
            msg.message || '',
            currency,
            amount,
            msg.classification_label || '',
        ].map(escapeCSV).join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const normalizeLabelNames = (count, names) => {
    return Array.from({ length: count }, (_, index) => {
        const value = names[index] || '';
        const trimmed = value.trim();
        return trimmed || `標籤 ${index + 1}`;
    });
};

const sanitizeFilenamePart = (value, fallback) => {
    const safe = (value || fallback || '')
        .toString()
        .trim()
        .replace(/[^\w\u4e00-\u9fff-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe || fallback;
};

const toCompactTimePart = (value, fallback) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
};

const buildClassificationFilename = ({ authorName, authorId, startTime, endTime, ext }) => {
    const safeAuthorName = sanitizeFilenamePart(authorName, 'author');
    const safeAuthorId = sanitizeFilenamePart(authorId, 'unknown_author');
    const rangeStart = toCompactTimePart(startTime, 'start');
    const rangeEnd = toCompactTimePart(endTime, 'end');
    return `message_classification_${safeAuthorName}_${safeAuthorId}_${rangeStart}-${rangeEnd}.${ext}`;
};

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
                        style={{ height: '1.2em', width: 'auto' }}
                        loading="lazy"
                    />
                ) : (
                    <span key={part.key}>{part.content}</span>
                )
            )}
        </span>
    );
};

const AuthorMessageClassificationPage = () => {
    const { authorId } = useParams();
    const [searchParams] = useSearchParams();
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');

    const [summary, setSummary] = useState(null);
    const [pageLoading, setPageLoading] = useState(true);
    const [pageError, setPageError] = useState(null);

    const [step, setStep] = useState('setup');
    const [classifyLoading, setClassifyLoading] = useState(false);
    const [classifyError, setClassifyError] = useState(null);
    const [labelCount, setLabelCount] = useState(2);
    const [labelNames, setLabelNames] = useState(['標籤 1', '標籤 2']);

    const [allMessages, setAllMessages] = useState([]);
    const [targetMessageIndices, setTargetMessageIndices] = useState([]);
    const [currentPointer, setCurrentPointer] = useState(0);
    const [targetLabels, setTargetLabels] = useState([]);
    const [isStreamingMessages, setIsStreamingMessages] = useState(false);
    const [loadedMessageCount, setLoadedMessageCount] = useState(0);
    const [totalMessageCount, setTotalMessageCount] = useState(null);
    const classificationRunRef = useRef(0);
    const activeContextMessageRef = useRef(null);

    useEffect(() => {
        return () => {
            classificationRunRef.current += 1;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!authorId) return;
            setPageLoading(true);
            setPageError(null);
            try {
                const summaryData = await fetchAuthorSummary({ authorId, startTime, endTime });
                if (cancelled) return;
                setSummary(summaryData);
            } catch (err) {
                if (cancelled) return;
                setPageError(err.message || '載入作者資料失敗');
            } finally {
                if (!cancelled) setPageLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [authorId, startTime, endTime]);

    const handleLabelCountChange = (nextCount) => {
        const safeCount = Number.isFinite(nextCount)
            ? Math.min(12, Math.max(1, nextCount))
            : 1;
        setLabelCount(safeCount);
        setLabelNames((prev) => Array.from({ length: safeCount }, (_, index) => prev[index] || `標籤 ${index + 1}`));
    };

    const handleStartClassification = useCallback(async () => {
        if (!authorId) return;
        const runId = classificationRunRef.current + 1;
        classificationRunRef.current = runId;

        setClassifyLoading(true);
        setClassifyError(null);
        setStep('setup');
        setAllMessages([]);
        setTargetMessageIndices([]);
        setTargetLabels([]);
        setCurrentPointer(0);
        setLoadedMessageCount(0);
        setTotalMessageCount(null);
        setIsStreamingMessages(true);

        try {
            const normalizedNames = normalizeLabelNames(labelCount, labelNames);
            setLabelNames(normalizedNames);

            const aggregatedMessages = [];
            let offset = 0;
            let total = Infinity;

            while (offset < total) {
                const response = await fetchChatMessages({
                    limit: CHAT_BATCH_SIZE,
                    offset,
                    startTime,
                    endTime,
                });

                if (classificationRunRef.current !== runId) return;

                const batch = response.messages || [];
                total = response.total || 0;
                setTotalMessageCount(total);
                if (batch.length === 0) break;

                aggregatedMessages.push(...batch);
                setLoadedMessageCount(aggregatedMessages.length);
                setAllMessages([...aggregatedMessages]);

                const targetIndices = [];
                aggregatedMessages.forEach((message, index) => {
                    if (message.author_id === authorId) targetIndices.push(index);
                });

                if (targetIndices.length > 0) {
                    setTargetMessageIndices(targetIndices);
                    setTargetLabels((prev) => targetIndices.map((_, index) => prev[index] || ''));
                    setStep('labeling');
                }

                offset += CHAT_BATCH_SIZE;
            }

            if (classificationRunRef.current !== runId) return;

            if (!aggregatedMessages.some((message) => message.author_id === authorId)) {
                setClassifyError('此時間範圍內沒有該作者可分類訊息');
                setStep('setup');
            }
        } catch (err) {
            if (classificationRunRef.current !== runId) return;
            setClassifyError(err.message || '載入分類資料失敗');
            setStep('setup');
        } finally {
            if (classificationRunRef.current === runId) {
                setClassifyLoading(false);
                setIsStreamingMessages(false);
            }
        }
    }, [authorId, endTime, labelCount, labelNames, startTime]);

    const targetTotal = targetMessageIndices.length;
    const displayedTargetTotal = useMemo(() => {
        if (Number.isFinite(summary?.total_messages)) {
            return summary.total_messages;
        }
        return targetTotal;
    }, [summary, targetTotal]);
    const currentAbsoluteIndex = targetMessageIndices[currentPointer] ?? -1;
    const currentMessage = currentAbsoluteIndex >= 0 ? allMessages[currentAbsoluteIndex] : null;
    const contextStart = Math.max(0, currentAbsoluteIndex - CONTEXT_WINDOW_SIZE);
    const contextEnd = Math.min(allMessages.length, currentAbsoluteIndex + CONTEXT_WINDOW_SIZE + 1);
    const contextMessages = currentAbsoluteIndex >= 0 ? allMessages.slice(contextStart, contextEnd) : [];

    const handleLabelSelect = (label) => {
        setTargetLabels((prev) => {
            const next = [...prev];
            next[currentPointer] = label;
            return next;
        });

        if (currentPointer >= targetTotal - 1) {
            if (!isStreamingMessages) {
                setStep('summary');
            }
            return;
        }

        setCurrentPointer((pointer) => Math.min(targetTotal - 1, pointer + 1));
    };

    const handleNext = () => {
        if (currentPointer >= targetTotal - 1 && isStreamingMessages) {
            return;
        }
        if (currentPointer >= targetTotal - 1) {
            setStep('summary');
            return;
        }
        setCurrentPointer((pointer) => pointer + 1);
    };

    useEffect(() => {
        if (!activeContextMessageRef.current) return;
        if (typeof activeContextMessageRef.current.scrollIntoView === 'function') {
            activeContextMessageRef.current.scrollIntoView({ block: 'center' });
        }
    }, [currentPointer, currentAbsoluteIndex, contextMessages.length]);

    const completedCount = useMemo(() => targetLabels.filter(Boolean).length, [targetLabels]);
    const labeledMessages = useMemo(() => {
        return targetMessageIndices.map((absoluteIndex, pointer) => ({
            ...allMessages[absoluteIndex],
            classification_label: targetLabels[pointer] || '',
        }));
    }, [allMessages, targetLabels, targetMessageIndices]);

    const summaryRows = useMemo(() => {
        const total = targetLabels.length;
        const stats = new Map();
        labelNames.forEach((label) => stats.set(label, 0));
        targetLabels.forEach((label) => {
            if (!label) return;
            stats.set(label, (stats.get(label) || 0) + 1);
        });
        return Array.from(stats.entries()).map(([label, count]) => ({
            label,
            count,
            ratio: total > 0 ? (count / total) * 100 : 0,
        }));
    }, [labelNames, targetLabels]);

    const handleDownload = (format) => {
        const name = summary?.display_name || 'author';
        const filename = buildClassificationFilename({
            authorName: name,
            authorId,
            startTime,
            endTime,
            ext: format,
        });
        if (format === 'csv') {
            downloadLabeledMessagesAsCSV(labeledMessages, filename);
            return;
        }
        downloadAsJSON(labeledMessages, filename);
    };

    const authorBackHref = useMemo(() => {
        const params = new URLSearchParams();
        if (startTime) params.append('start_time', startTime);
        if (endTime) params.append('end_time', endTime);
        const query = params.toString();
        return `/authors/${encodeURIComponent(authorId)}${query ? `?${query}` : ''}`;
    }, [authorId, endTime, startTime]);

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <div className="flex justify-between items-center mb-6 relative">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">Message Classification</h1>
                        <Link to={authorBackHref} className="text-sm text-white/90 underline hover:text-white">回 Author Detail</Link>
                    </div>
                    <Navigation />
                </div>

                <div className="glass-card rounded-2xl p-6 space-y-4">
                    {pageLoading ? (
                        <div className="text-sm text-gray-500">載入中...</div>
                    ) : pageError ? (
                        <div className="text-sm text-red-600">錯誤: {pageError}</div>
                    ) : (
                        <>
                            <div className="text-sm text-gray-700">
                                <span className="font-semibold">{summary?.display_name || authorId}</span>
                                <span className="ml-2 text-xs text-gray-500">author_id: {authorId}</span>
                            </div>

                            {step === 'setup' && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                                    <div className="text-sm font-semibold text-gray-800">設定分類標籤</div>
                                    <div className="flex items-center gap-2">
                                        <label htmlFor="label-count" className="text-xs text-gray-600">標籤種類數</label>
                                        <input
                                            id="label-count"
                                            type="number"
                                            min="1"
                                            max="12"
                                            value={labelCount}
                                            onChange={(e) => handleLabelCountChange(Number(e.target.value))}
                                            className="w-20 px-2 py-1 text-sm border rounded"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {Array.from({ length: labelCount }, (_, index) => (
                                            <input
                                                key={`label-name-${index}`}
                                                type="text"
                                                value={labelNames[index] || ''}
                                                placeholder={`標籤 ${index + 1}`}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setLabelNames((prev) => {
                                                        const next = [...prev];
                                                        next[index] = value;
                                                        return next;
                                                    });
                                                }}
                                                className="px-2 py-1.5 text-sm border rounded"
                                            />
                                        ))}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        會對該作者每一則訊息顯示聊天室前後各 {CONTEXT_WINDOW_SIZE} 則上下文。
                                    </div>
                                    {classifyError && (
                                        <div className="text-xs text-red-600">{classifyError}</div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleStartClassification}
                                        disabled={classifyLoading}
                                        className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
                                    >
                                        {classifyLoading ? '載入中...' : '開始分類'}
                                    </button>
                                </div>
                            )}

                            {step === 'labeling' && currentMessage && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-2xl font-bold text-gray-800">
                                            正在分類第 {currentPointer + 1} / {displayedTargetTotal} 則
                                        </div>
                                        <div className="text-2xl font-bold text-gray-600">
                                            已完成 {completedCount} / {displayedTargetTotal}
                                        </div>
                                    </div>
                                    {isStreamingMessages && (
                                        <div className="text-xs text-gray-500">
                                            載入聊天室訊息中... {loadedMessageCount}{totalMessageCount != null ? ` / ${totalMessageCount}` : ''}
                                        </div>
                                    )}

                                    <div className="rounded border border-blue-300 bg-white p-3">
                                        <div className="text-xs text-gray-500">{formatMessageTime(currentMessage.time)}</div>
                                        <div className="text-xl font-bold text-gray-700 mt-1">{currentMessage.author || 'Unknown'}</div>
                                        <div className="text-2xl font-bold text-gray-800 mt-2 break-words">
                                            {renderMessageWithEmojis(currentMessage.message, currentMessage.emotes)}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {labelNames.map((label) => {
                                            const selected = targetLabels[currentPointer] === label;
                                            return (
                                                <button
                                                    key={label}
                                                    type="button"
                                                    onClick={() => handleLabelSelect(label)}
                                                    className={`px-3 py-1.5 text-base rounded border ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="space-y-1 max-h-80 overflow-y-auto rounded border border-gray-200 bg-white p-2">
                                        {contextMessages.map((message, index) => {
                                            const absoluteIndex = contextStart + index;
                                            const isCurrent = absoluteIndex === currentAbsoluteIndex;
                                            return (
                                                <div
                                                    key={`${message.id || 'msg'}-${absoluteIndex}`}
                                                    ref={isCurrent ? activeContextMessageRef : null}
                                                    className={`rounded px-2 py-1 ${isCurrent ? 'bg-blue-100 border border-blue-300' : 'bg-gray-50'}`}
                                                >
                                                    <div className="text-xs text-gray-500">{formatMessageTime(message.time)}</div>
                                                    <div className="text-xl font-semibold text-gray-700 break-words">
                                                        {renderMessageWithEmojis(message.message, message.emotes)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPointer((pointer) => Math.max(0, pointer - 1))}
                                            disabled={currentPointer === 0}
                                            className="px-3 py-1.5 text-base rounded bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
                                        >
                                            上一個
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleNext}
                                            disabled={!targetLabels[currentPointer]}
                                            className="px-3 py-1.5 text-base rounded bg-blue-600 text-white disabled:bg-gray-300"
                                        >
                                            {currentPointer >= targetTotal - 1 ? (isStreamingMessages ? '載入更多中...' : '完成分類') : '下一個'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {step === 'summary' && (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                                    <div className="text-sm font-semibold text-gray-800">分類總覽</div>
                                    <div className="space-y-2">
                                        {summaryRows.map((item) => (
                                            <div key={item.label} className="flex items-center justify-between text-sm">
                                                <div className="text-gray-700">{item.label}</div>
                                                <div className="text-gray-600">{item.count} 則 ({item.ratio.toFixed(1)}%)</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleDownload('csv')}
                                            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                                        >
                                            下載分類 CSV
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDownload('json')}
                                            className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                                        >
                                            下載分類 JSON
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStep('labeling')}
                                            className="px-3 py-1.5 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                        >
                                            返回修改
                                        </button>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        檔案會下載到瀏覽器預設下載資料夾，檔名格式為 `message_classification_作者_作者ID_起訖時間.副檔名`
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthorMessageClassificationPage;
