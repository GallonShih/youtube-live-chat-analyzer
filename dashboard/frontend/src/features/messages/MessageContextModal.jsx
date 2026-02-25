import React, { useState, useEffect, useRef, useMemo } from 'react';
import { XMarkIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline';
import { fetchChatMessages } from '../../api/chat';
import { formatMessageTime } from '../../utils/formatters';

const PAGE_SIZE = 20;

function MessageContextModal({ isOpen, onClose, targetMessage, startTime, endTime }) {
    const [page, setPage] = useState(1);
    const [messages, setMessages] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [highlightId, setHighlightId] = useState(null);
    const rowRefs = useRef({});
    // Track the page that was computed for the target — so we can distinguish
    // "initial open" from "user clicked prev/next"
    const initialPageRef = useRef(null);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    // Mirror the 12h default that useChatMessages applies on the frontend when no time filter is
    // set (MessageList uses useChatMessages which auto-applies this; the modal calls
    // fetchChatMessages directly so we must replicate it here to stay consistent).
    const effectiveStart = useMemo(
        () => startTime || new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        [startTime]
    );

    // On open: compute target page then load it in one sequential flow
    useEffect(() => {
        if (!isOpen || !targetMessage) return;

        setHighlightId(targetMessage.id);
        setLoading(true);
        // Set PENDING immediately (synchronously) so manual-pagination effect skips on this render
        initialPageRef.current = 'PENDING';

        // Fetch in parallel: messages up-to-target (N) and total in full range (M).
        // Messages are ordered DESC (newest first), so the target sits at position
        // (M - N) from the top. Page = floor((M-N) / PAGE_SIZE) + 1.
        Promise.all([
            fetchChatMessages({ limit: 1, offset: 0, startTime: effectiveStart, endTime: targetMessage.time }),
            fetchChatMessages({ limit: 1, offset: 0, startTime: effectiveStart, endTime }),
        ])
            .then(([{ total: countUpTo }, { total: totalInRange }]) => {
                const messagesAfterTarget = totalInRange - countUpTo;
                const targetPage = Math.max(1, Math.floor(messagesAfterTarget / PAGE_SIZE) + 1);
                initialPageRef.current = targetPage;
                setPage(targetPage);
                return fetchChatMessages({
                    limit: PAGE_SIZE,
                    offset: (targetPage - 1) * PAGE_SIZE,
                    startTime: effectiveStart,
                    endTime,
                });
            })
            .then(({ messages: msgs, total: t }) => {
                setMessages(msgs);
                setTotal(t);
                // Clear the skip signal only when targetPage === 1.
                // When targetPage === 1, setPage(1) is a no-op (page was already 1),
                // so Effect 2 won't re-run and we must clear the signal here.
                // When targetPage > 1, setPage triggers a re-render and Effect 2 runs;
                // it will clear initialPageRef.current after detecting the initial-page match.
                if (initialPageRef.current === 1) {
                    initialPageRef.current = null;
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen, targetMessage, effectiveStart, endTime]);

    // Manual pagination: load messages when user changes page (skip initial computed page)
    useEffect(() => {
        if (!isOpen) return;
        // Skip while compute-page effect is in-flight ('PENDING') or has just set this page (number)
        if (initialPageRef.current !== null) {
            if (initialPageRef.current === page) {
                // Consume the skip signal — next page change is user-initiated
                initialPageRef.current = null;
            }
            return;
        }

        setLoading(true);
        fetchChatMessages({
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
            startTime: effectiveStart,
            endTime,
        })
            .then(({ messages: msgs, total: t }) => {
                setMessages(msgs);
                setTotal(t);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [isOpen, page, effectiveStart, endTime]);

    // Scroll to highlighted message after messages load.
    // Read the ref inside the timer callback (not at effect time) so the lookup
    // always uses the current ref map even if React defers ref attachment slightly.
    useEffect(() => {
        if (!highlightId || messages.length === 0) return;
        const timerId = setTimeout(() => {
            const el = rowRefs.current[highlightId];
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
        return () => clearTimeout(timerId);
    }, [messages, highlightId]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setTotal(0);
            setPage(1);
            setHighlightId(null);
            rowRefs.current = {};
            initialPageRef.current = null;
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const isPaid = (msg) =>
        msg.message_type === 'paid_message' || msg.message_type === 'ticker_paid_message_item';

    const renderMessageWithEmojis = (messageText, emotes) => {
        if (!messageText) return null;
        if (!emotes || emotes.length === 0) return <span>{messageText}</span>;

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

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-white"
            role="dialog"
            aria-modal="true"
            aria-label="訊息列表"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
                <div className="flex items-center gap-2">
                    <ArrowsPointingOutIcon className="w-5 h-5 text-gray-600" />
                    <h2 className="font-bold text-gray-800">訊息列表</h2>
                    {(startTime || endTime) && (
                        <span className="text-xs text-gray-500 ml-2">
                            {startTime ? formatMessageTime(startTime) : ''}
                            {' → '}
                            {endTime ? formatMessageTime(endTime) : '現在'}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded hover:bg-gray-200 cursor-pointer text-gray-500 hover:text-gray-800 transition-colors"
                    aria-label="關閉"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Desktop column header */}
            <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 px-4 py-2 text-sm font-semibold text-gray-600 border-b border-gray-200 bg-gray-50 shrink-0">
                <span>時間</span><span>作者</span><span>訊息</span><span>金額</span>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex justify-center items-center h-full text-gray-500">載入中...</div>
                ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full text-gray-500">無資料</div>
                ) : (
                    messages.map((msg) => {
                        const isHighlighted = msg.id === highlightId;
                        const moneyText = isPaid(msg) && msg.money ? msg.money.text : '';

                        return (
                            <div
                                key={msg.id}
                                ref={(el) => { rowRefs.current[msg.id] = el; }}
                                className={`transition-colors duration-300 ${
                                    isHighlighted
                                        ? 'bg-amber-50 ring-2 ring-amber-400 ring-inset'
                                        : 'hover:bg-gray-50'
                                }`}
                            >
                                {/* Mobile card */}
                                <div className="md:hidden border-b border-gray-200 py-3 px-4 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-gray-700 truncate max-w-[60%]">
                                            {msg.author || 'Unknown'}
                                        </span>
                                        <span className="text-xs text-gray-400">{formatMessageTime(msg.time)}</span>
                                    </div>
                                    <div className="text-sm text-gray-900 break-words">{renderMessageWithEmojis(msg.message, msg.emotes)}</div>
                                    {moneyText && <div className="text-sm font-semibold text-green-600">{moneyText}</div>}
                                </div>
                                {/* Desktop grid */}
                                <div className="hidden md:grid grid-cols-[140px_minmax(100px,1fr)_minmax(200px,2fr)_100px] lg:grid-cols-[180px_minmax(150px,1fr)_minmax(300px,2fr)_120px] gap-2 lg:gap-4 px-4 text-sm border-b border-gray-200 py-2">
                                    <span className="text-gray-500 whitespace-nowrap text-xs lg:text-sm">{formatMessageTime(msg.time)}</span>
                                    <span className="font-semibold text-gray-700 truncate">{msg.author || 'Unknown'}</span>
                                    <span className="text-gray-900 break-words">{renderMessageWithEmojis(msg.message, msg.emotes)}</span>
                                    <span className={`font-semibold ${moneyText ? 'text-green-600' : 'text-gray-400'}`}>{moneyText || '-'}</span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Pagination footer */}
            {total > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
                    <button
                        onClick={() => setPage((p) => p - 1)}
                        disabled={page === 1 || loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-sm"
                    >
                        上一頁
                    </button>
                    <span className="text-sm text-gray-600">
                        第 {page} / {totalPages} 頁（共 {total} 則）
                    </span>
                    <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={page >= totalPages || loading}
                        className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-sm"
                    >
                        下一頁
                    </button>
                </div>
            )}
        </div>
    );
}

export default MessageContextModal;
