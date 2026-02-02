import React, { useState, useEffect } from 'react';
import {
    CurrencyDollarIcon,
    ExclamationTriangleIcon,
    TrophyIcon,
} from '@heroicons/react/24/outline';
import { fetchMoneySummary } from '../../api/stats';
import { formatCurrency } from '../../utils/formatters';

const MoneyStats = ({ startTime, endTime, hasTimeFilter = false }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const getStats = async () => {
            try {
                setLoading(true);
                const data = await fetchMoneySummary({ startTime, endTime });
                setStats(data);
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
        return <div className="mt-8 glass-card rounded-2xl p-6 text-center text-gray-500">Loading money statistics...</div>;
    }

    if (error) {
        return <div className="mt-8 glass-card rounded-2xl p-6 text-center text-red-500">Error: {error}</div>;
    }

    if (!stats) return null;

    return (
        <div className="mt-8 space-y-4">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-white drop-shadow-lg">
                <CurrencyDollarIcon className="w-7 h-7" />
                <span>Money Statistics</span>
            </h2>
            {stats.unknown_currencies?.length > 0 && (
                <div className="glass-stat-amber rounded-2xl p-4">
                    <p className="text-sm text-amber-800 flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                        <span>Some currencies don't have exchange rates set: <strong>{stats.unknown_currencies.join(', ')}</strong></span>
                        <br />
                        <a href="/admin" className="underline hover:text-amber-900">Go to Admin Panel</a>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="glass-stat-green rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-green-800 mb-4">Total Revenue</h3>
                    <div className="space-y-3">
                        <div>
                            <div className="text-4xl font-bold text-green-900">{formatCurrency(stats.total_amount_twd)}</div>
                            <div className="text-sm text-green-700 mt-1">Total Amount (TWD)</div>
                        </div>
                        <div className="pt-3 border-t border-green-300">
                            <div className="text-2xl font-semibold text-green-800">{stats.paid_message_count}</div>
                            <div className="text-sm text-green-700">Paid Messages</div>
                        </div>
                        {stats.paid_message_count > 0 && (
                            <div className="pt-3 border-t border-green-300">
                                <div className="text-lg font-medium text-green-800">{formatCurrency(stats.total_amount_twd / stats.paid_message_count)}</div>
                                <div className="text-sm text-green-700">Average per Message</div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-card rounded-2xl p-6">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 mb-4">
                        <TrophyIcon className="w-5 h-5" />
                        <span>Top 5 Contributors</span>
                    </h3>
                    {stats.top_authors?.length > 0 ? (
                        <div className="space-y-3">
                            {stats.top_authors.map((author, index) => {
                                const maxAmount = stats.top_authors[0].amount_twd;
                                const barWidth = (author.amount_twd / maxAmount) * 100;
                                return (
                                    <div key={index} className="space-y-1">
                                        <div className="flex justify-between items-baseline text-sm">
                                            <span className="font-medium text-gray-700 truncate flex-1">{index + 1}. {author.author}</span>
                                            <span className="font-semibold text-green-700 ml-2">{formatCurrency(author.amount_twd)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                                <div className="bg-gradient-to-r from-green-500 to-green-600 h-full transition-all" style={{ width: `${barWidth}%` }} />
                                            </div>
                                            <span className="text-xs text-gray-500 w-16 text-right">{author.message_count} msg{author.message_count !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">No paid messages</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoneyStats;
