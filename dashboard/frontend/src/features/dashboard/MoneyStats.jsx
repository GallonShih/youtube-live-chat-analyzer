import React, { useState, useEffect } from 'react';
import {
    CurrencyDollarIcon,
    ExclamationTriangleIcon,
    TrophyIcon,
} from '@heroicons/react/24/outline';
import { fetchMoneySummary } from '../../api/stats';
import { formatCurrency } from '../../utils/formatters';
import { SkeletonStatCard } from '../../components/common/Skeleton';

const MoneyStats = ({ startTime, endTime, hasTimeFilter = false }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeAuthorId, setActiveAuthorId] = useState(null);
    const [copiedAuthorId, setCopiedAuthorId] = useState(null);

    useEffect(() => {
        const getStats = async () => {
            try {
                setLoading(true);
                const data = await fetchMoneySummary({ startTime, endTime });
                setStats(data);
                setActiveAuthorId((prev) => {
                    if (!prev || !data?.top_authors?.some((author) => author.author_id === prev)) {
                        return null;
                    }
                    return prev;
                });
                setCopiedAuthorId(null);
                setError(null);
            } catch (err) {
                console.error('Error fetching money stats:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        getStats();

        if (!hasTimeFilter) {
            const intervalId = setInterval(getStats, 30000);
            return () => clearInterval(intervalId);
        }
    }, [startTime, endTime, hasTimeFilter]);

    if (loading && !stats) {
        return (
            <div className="mt-6 sm:mt-8 space-y-4">
                <div className="h-8 w-48 bg-white/50 rounded-lg animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <SkeletonStatCard className="h-48" />
                    <SkeletonStatCard className="h-48" />
                </div>
            </div>
        );
    }

    if (error) {
        return <div className="mt-8 glass-card rounded-2xl p-6 text-center text-red-500">Error: {error}</div>;
    }

    if (!stats) return null;

    const toggleAuthorPopover = (authorId) => {
        setActiveAuthorId((prev) => (prev === authorId ? null : authorId));
        setCopiedAuthorId(null);
    };

    const copyAuthorId = async (authorId) => {
        if (!authorId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
        try {
            await navigator.clipboard.writeText(authorId);
            setCopiedAuthorId(authorId);
            setTimeout(() => {
                setCopiedAuthorId((prev) => (prev === authorId ? null : prev));
            }, 1500);
        } catch (copyError) {
            console.error('Copy author_id failed:', copyError);
        }
    };

    return (
        <div className="mt-6 sm:mt-8 space-y-4">
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-white drop-shadow-lg">
                <CurrencyDollarIcon className="w-6 h-6 sm:w-7 sm:h-7" />
                <span>Money Statistics</span>
            </h2>
            {stats.unknown_currencies?.length > 0 && (
                <div className="glass-stat-amber rounded-2xl p-3 sm:p-4">
                    <p className="text-xs sm:text-sm text-amber-800 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" />
                        <span>Missing exchange rates: <strong>{stats.unknown_currencies.join(', ')}</strong> - <a href="/admin" className="underline hover:text-amber-900">Set in Admin</a></span>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div className="glass-stat-green rounded-2xl p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-green-800 mb-3 sm:mb-4">Total Revenue</h3>
                    <div className="space-y-2 sm:space-y-3">
                        <div>
                            <div className="text-2xl sm:text-4xl font-bold text-green-900">{formatCurrency(stats.total_amount_twd)}</div>
                            <div className="text-xs sm:text-sm text-green-700 mt-1">Total Amount (TWD)</div>
                        </div>
                        <div className="pt-2 sm:pt-3 border-t border-green-300">
                            <div className="text-xl sm:text-2xl font-semibold text-green-800">{stats.paid_message_count}</div>
                            <div className="text-xs sm:text-sm text-green-700">Paid Messages</div>
                        </div>
                        {stats.paid_message_count > 0 && (
                            <div className="pt-2 sm:pt-3 border-t border-green-300">
                                <div className="text-base sm:text-lg font-medium text-green-800">{formatCurrency(stats.total_amount_twd / stats.paid_message_count)}</div>
                                <div className="text-xs sm:text-sm text-green-700">Average per Message</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-card rounded-2xl p-4 sm:p-6">
                    <h3 className="flex items-center gap-2 text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">
                        <TrophyIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Top 5 Contributors</span>
                    </h3>
                    {stats.top_authors?.length > 0 ? (
                        <div className="space-y-2 sm:space-y-3">
                            {stats.top_authors.map((author, index) => {
                                const maxAmount = stats.top_authors[0].amount_twd;
                                const barWidth = (author.amount_twd / maxAmount) * 100;
                                const popoverPositionClass = index >= 2 ? 'bottom-full mb-1' : 'top-full mt-1';
                                return (
                                    <div key={author.author_id || `${author.author}-${index}`} className="space-y-1">
                                        <div className="flex justify-between items-baseline text-xs sm:text-sm">
                                            <div className="relative flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleAuthorPopover(author.author_id);
                                                    }}
                                                    className="font-medium text-gray-700 truncate w-full text-left hover:underline cursor-pointer"
                                                    title="點擊查看 author_id"
                                                >
                                                    {index + 1}. {author.author}
                                                </button>
                                                {activeAuthorId === author.author_id && (
                                                    <div
                                                        onClick={(event) => event.stopPropagation()}
                                                        className={`absolute left-0 z-20 w-56 max-w-[80vw] rounded-lg border border-gray-200 bg-white p-2 shadow-lg ${popoverPositionClass}`}
                                                    >
                                                        <div className="text-[11px] text-gray-500">author_id</div>
                                                        <div className="mt-1 font-mono text-xs text-gray-700 break-all">
                                                            {author.author_id || 'Unknown'}
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => copyAuthorId(author.author_id)}
                                                                className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500"
                                                            >
                                                                {copiedAuthorId === author.author_id ? '已複製' : '複製 ID'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveAuthorId(null)}
                                                                className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                                                            >
                                                                關閉
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="font-semibold text-green-700 ml-2">{formatCurrency(author.amount_twd)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                                                <div className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all" style={{ width: `${barWidth}%` }} />
                                            </div>
                                            <span className="text-xs text-gray-500 w-12 sm:w-16 text-right">{author.message_count} <span className="hidden sm:inline">msg</span></span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-6 sm:py-8 text-sm text-gray-500">No paid messages</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoneyStats;
