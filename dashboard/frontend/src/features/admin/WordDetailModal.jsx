import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import API_BASE_URL from '../../api/client';

const WordDetailModal = ({ isOpen, onClose, word, wordType, sourceWord, targetWord }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [wordData, setWordData] = useState(null);
    const [textMiningData, setTextMiningData] = useState(null);
    const [textMiningLoading, setTextMiningLoading] = useState(false);
    const modalRef = useRef(null);
    const closeButtonRef = useRef(null);

    // Fetch word occurrence data
    useEffect(() => {
        if (!isOpen || !word) return;

        const fetchWordData = async () => {
            setLoading(true);
            setError(null);
            setWordData(null);
            setTextMiningData(null);

            try {
                const params = new URLSearchParams({
                    word: word,
                    limit: '10'
                });
                if (wordType) {
                    params.append('word_type', wordType);
                }

                const res = await fetch(`${API_BASE_URL}/api/admin/word-occurrences?${params}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch word data: ${res.statusText}`);
                }
                const data = await res.json();
                setWordData(data);

                // If text mining is available, fetch it
                if (data.text_mining_available && data.seven_day_start && data.seven_day_end) {
                    fetchTextMining(word, data.seven_day_start, data.seven_day_end);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchWordData();
    }, [isOpen, word, wordType]);

    // Fetch text mining data
    const fetchTextMining = async (targetWord, startTime, endTime) => {
        setTextMiningLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/text-mining/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_word: targetWord,
                    start_time: startTime,
                    end_time: endTime
                })
            });

            if (!res.ok) {
                throw new Error('Failed to fetch text mining data');
            }

            const data = await res.json();
            setTextMiningData(data);
        } catch (err) {
            console.error('Text mining error:', err);
            // Don't set error state, text mining is optional
        } finally {
            setTextMiningLoading(false);
        }
    };

    // Keyboard and focus management
    useEffect(() => {
        if (isOpen) {
            closeButtonRef.current?.focus();

            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    onClose();
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Just display the clicked word
    const displayWord = word;

    return ReactDOM.createPortal(
        <div
            className="fixed inset-0 z-50 glass-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="word-detail-modal-title"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
            }}
        >
            <div
                ref={modalRef}
                className="glass-modal rounded-2xl overflow-hidden flex flex-col"
                style={{
                    width: 'calc(100% - 2rem)',
                    maxWidth: '56rem',
                    maxHeight: 'calc(100vh - 4rem)'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3
                                id="word-detail-modal-title"
                                className="text-xl font-bold text-gray-900"
                            >
                                詞彙詳情
                            </h3>
                            <p className="text-lg mt-2 font-semibold text-indigo-600">
                                {displayWord}
                            </p>
                        </div>
                        <button
                            ref={closeButtonRef}
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                            aria-label="關閉"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                            <p className="mt-4 text-gray-500">載入中...</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                            錯誤: {error}
                        </div>
                    )}

                    {!loading && !error && wordData && (
                        <div className="space-y-6">
                            {/* Statistics */}
                            <div className="bg-gray-50 rounded-lg p-4">
                                <p className="text-sm text-gray-600">
                                    總出現次數: <span className="font-semibold text-gray-900">{wordData.total_occurrences}</span>
                                </p>
                            </div>

                            {/* Recent Messages */}
                            <div>
                                <h4 className="text-lg font-semibold text-gray-900 mb-3">
                                    最近 {wordData.messages.length} 次出現的訊息
                                </h4>
                                {wordData.messages.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">沒有找到包含此詞彙的訊息</p>
                                ) : (
                                    <div className="space-y-3">
                                        {wordData.messages.map((msg, idx) => (
                                            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-semibold text-indigo-600">{msg.author}</span>
                                                    <span className="text-sm text-gray-500">
                                                        {new Date(msg.published_at).toLocaleString('zh-TW', {
                                                            year: 'numeric',
                                                            month: '2-digit',
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>
                                                <p className="text-gray-700 break-words">{msg.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Text Mining Results */}
                            {wordData.text_mining_available && (
                                <div>
                                    <h4 className="text-lg font-semibold text-gray-900 mb-3">
                                        7 天文字探勘結果
                                    </h4>
                                    {textMiningLoading && (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                            <p className="ml-3 text-gray-500">載入文字探勘結果...</p>
                                        </div>
                                    )}
                                    {!textMiningLoading && textMiningData && (
                                        <div className="bg-gray-50 rounded-lg p-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Processed Message Stats */}
                                                <div className="bg-white rounded p-3">
                                                    <h5 className="font-semibold text-gray-700 mb-2">處理後訊息</h5>
                                                    <p className="text-sm text-gray-600">
                                                        匹配數: {textMiningData.stats.matched_processed} / {textMiningData.stats.total_messages}
                                                    </p>
                                                    {textMiningData.processed_message.forward['1'] && textMiningData.processed_message.forward['1'].length > 0 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs font-semibold text-gray-600">向後延伸 (1字):</p>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {textMiningData.processed_message.forward['1'].slice(0, 5).map((item, i) => (
                                                                    <span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                                                                        {item.text} ({item.count})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {textMiningData.processed_message.backward['1'] && textMiningData.processed_message.backward['1'].length > 0 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs font-semibold text-gray-600">向前延伸 (1字):</p>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {textMiningData.processed_message.backward['1'].slice(0, 5).map((item, i) => (
                                                                    <span key={i} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                                                        {item.text} ({item.count})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Original Message Stats */}
                                                <div className="bg-white rounded p-3">
                                                    <h5 className="font-semibold text-gray-700 mb-2">原始訊息</h5>
                                                    <p className="text-sm text-gray-600">
                                                        匹配數: {textMiningData.stats.matched_original} / {textMiningData.stats.total_messages}
                                                    </p>
                                                    {textMiningData.original_message.forward['1'] && textMiningData.original_message.forward['1'].length > 0 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs font-semibold text-gray-600">向後延伸 (1字):</p>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {textMiningData.original_message.forward['1'].slice(0, 5).map((item, i) => (
                                                                    <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                                                        {item.text} ({item.count})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {textMiningData.original_message.backward['1'] && textMiningData.original_message.backward['1'].length > 0 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs font-semibold text-gray-600">向前延伸 (1字):</p>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {textMiningData.original_message.backward['1'].slice(0, 5).map((item, i) => (
                                                                    <span key={i} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                                                                        {item.text} ({item.count})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {!textMiningLoading && !textMiningData && (
                                        <p className="text-gray-500 text-center py-4">無法載入文字探勘結果</p>
                                    )}
                                </div>
                            )}

                            {!wordData.text_mining_available && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <p className="text-yellow-800 text-sm">
                                        近7天內沒有包含此詞彙的訊息，無法進行文字探勘分析。
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default WordDetailModal;
