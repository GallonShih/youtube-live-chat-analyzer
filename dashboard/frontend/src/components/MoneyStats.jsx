import { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:8000';

const MoneyStats = ({ startTime, endTime, hasTimeFilter = false }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();

        // Auto-refresh every 30 seconds if no time filter
        if (!hasTimeFilter) {
            const intervalId = setInterval(fetchStats, 30000);
            return () => clearInterval(intervalId);
        }
    }, [startTime, endTime, hasTimeFilter]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();

            let effectiveStartTime = startTime;
            if (!effectiveStartTime && !endTime) {
                effectiveStartTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            }

            if (effectiveStartTime) params.append('start_time', effectiveStartTime);
            if (endTime) params.append('end_time', endTime);

            const response = await fetch(`${API_BASE_URL}/api/stats/money-summary?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setStats(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching money stats:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('zh-TW', {
            style: 'currency',
            currency: 'TWD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    if (loading && !stats) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <div className="text-center text-gray-500">Loading money statistics...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-8 bg-white rounded-lg shadow p-6">
                <div className="text-center text-red-500">Error loading statistics: {error}</div>
            </div>
        );
    }

    if (!stats) {
        return null;
    }

    return (
        <div className="mt-8 space-y-4">
            <h2 className="text-2xl font-bold text-gray-800">💰 Money Statistics</h2>

            {/* Warning for unknown currencies */}
            {stats.unknown_currencies && stats.unknown_currencies.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                        ⚠️ Some currencies don't have exchange rates set: <strong>{stats.unknown_currencies.join(', ')}</strong>
                        <br />
                        <a href="/admin" className="underline hover:text-yellow-900">
                            Go to Admin Panel to configure rates
                        </a>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Total Amount Card */}
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-md p-6 border border-green-200">
                    <h3 className="text-lg font-semibold text-green-800 mb-4">Total Revenue</h3>
                    <div className="space-y-3">
                        <div>
                            <div className="text-4xl font-bold text-green-900">
                                {formatCurrency(stats.total_amount_twd)}
                            </div>
                            <div className="text-sm text-green-700 mt-1">Total Amount (TWD)</div>
                        </div>
                        <div className="pt-3 border-t border-green-300">
                            <div className="text-2xl font-semibold text-green-800">
                                {stats.paid_message_count}
                            </div>
                            <div className="text-sm text-green-700">Paid Messages</div>
                        </div>
                        {stats.paid_message_count > 0 && (
                            <div className="pt-3 border-t border-green-300">
                                <div className="text-lg font-medium text-green-800">
                                    {formatCurrency(stats.total_amount_twd / stats.paid_message_count)}
                                </div>
                                <div className="text-sm text-green-700">Average per Message</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Top 5 Authors Card */}
                <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">🏆 Top 5 Contributors</h3>
                    {stats.top_authors && stats.top_authors.length > 0 ? (
                        <div className="space-y-3">
                            {stats.top_authors.map((author, index) => {
                                const maxAmount = stats.top_authors[0].amount_twd;
                                const barWidth = (author.amount_twd / maxAmount) * 100;

                                return (
                                    <div key={index} className="space-y-1">
                                        <div className="flex justify-between items-baseline text-sm">
                                            <span className="font-medium text-gray-700 truncate flex-1">
                                                {index + 1}. {author.author}
                                            </span>
                                            <span className="font-semibold text-green-700 ml-2">
                                                {formatCurrency(author.amount_twd)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                                <div
                                                    className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${barWidth}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-500 w-16 text-right">
                                                {author.message_count} msg{author.message_count > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No paid messages in this time range
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MoneyStats;
