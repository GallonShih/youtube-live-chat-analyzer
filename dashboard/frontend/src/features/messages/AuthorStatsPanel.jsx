import React, { useState, useEffect, useCallback } from 'react';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { fetchTopAuthors } from '../../api/chat';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const AuthorStatsPanel = ({
    startTime,
    endTime,
    authorFilter,
    messageFilter,
    paidMessageFilter,
    hasTimeFilter = false
}) => {
    const [topAuthors, setTopAuthors] = useState([]);
    const [totalAuthors, setTotalAuthors] = useState(0);
    const [displayedAuthors, setDisplayedAuthors] = useState(0);
    const [tieExtended, setTieExtended] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadTopAuthors = useCallback(async () => {
        try {
            setLoading(true);

            // Default to last 12 hours if no time range specified
            let effectiveStartTime = startTime;
            if (!effectiveStartTime && !endTime) {
                effectiveStartTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
            }

            const data = await fetchTopAuthors({
                startTime: effectiveStartTime,
                endTime,
                authorFilter,
                messageFilter,
                paidMessageFilter,
                includeMeta: true
            });

            const authors = data?.top_authors || [];
            setTopAuthors(authors);
            setTotalAuthors(data?.total_authors ?? authors.length);
            setDisplayedAuthors(data?.displayed_authors ?? authors.length);
            setTieExtended(Boolean(data?.tie_extended));
            setError(null);
        } catch (err) {
            console.error('Error fetching top authors:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [startTime, endTime, authorFilter, messageFilter, paidMessageFilter]);

    // Load data when filters change
    useEffect(() => {
        loadTopAuthors();
    }, [loadTopAuthors]);

    // Auto-refresh every 30 seconds if no time filter
    useEffect(() => {
        if (hasTimeFilter) return;

        const intervalId = setInterval(() => {
            loadTopAuthors();
        }, 30000);

        return () => clearInterval(intervalId);
    }, [hasTimeFilter, loadTopAuthors]);

    // Chart configuration
    const chartData = {
        labels: topAuthors.map(a => a.author),
        datasets: [{
            label: '訊息數量',
            data: topAuthors.map(a => a.count),
            backgroundColor: [
                'rgba(99, 102, 241, 0.8)',   // Indigo
                'rgba(139, 92, 246, 0.8)',   // Purple
                'rgba(168, 85, 247, 0.8)',   // Violet
                'rgba(192, 132, 252, 0.8)',  // Light violet
                'rgba(196, 181, 253, 0.8)',  // Lavender
                'rgba(167, 139, 250, 0.7)',  // Extra colors for ties
                'rgba(129, 140, 248, 0.7)',
                'rgba(165, 180, 252, 0.7)',
            ],
            borderColor: [
                'rgba(99, 102, 241, 1)',
                'rgba(139, 92, 246, 1)',
                'rgba(168, 85, 247, 1)',
                'rgba(192, 132, 252, 1)',
                'rgba(196, 181, 253, 1)',
                'rgba(167, 139, 250, 1)',
                'rgba(129, 140, 248, 1)',
                'rgba(165, 180, 252, 1)',
            ],
            borderWidth: 1,
            borderRadius: 4,
        }]
    };

    const chartOptions = {
        indexAxis: 'y',  // Horizontal bar chart
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: 'Top 5 發言作者',
                font: { size: 14, weight: 'bold' },
                padding: { bottom: 10 }
            },
            tooltip: {
                callbacks: {
                    label: (context) => `訊息數: ${context.raw}`
                }
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                title: { display: true, text: '訊息數量' },
                ticks: { precision: 0 }
            },
            y: {
                title: { display: false },
                ticks: {
                    font: { size: 12 },
                    callback: function (value) {
                        const label = this.getLabelForValue(value);
                        // Truncate long names
                        return label.length > 15 ? label.slice(0, 12) + '...' : label;
                    }
                }
            }
        }
    };

    const MIN_CHART_HEIGHT = 192;
    const MAX_CHART_HEIGHT = 560;
    const ROW_HEIGHT = 32;
    const CHART_PADDING = 56;
    const chartHeight = Math.min(
        MAX_CHART_HEIGHT,
        Math.max(MIN_CHART_HEIGHT, topAuthors.length * ROW_HEIGHT + CHART_PADDING)
    );

    if (error) {
        return (
            <div className="mt-4 p-4 bg-red-50 rounded-lg text-red-600 text-sm">
                載入 Top 作者時發生錯誤: {error}
            </div>
        );
    }

    return (
        <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
                <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-semibold text-gray-700">發言排行榜</h3>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    共 {totalAuthors} 位作者
                </span>
                {tieExtended && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        含同名次顯示 {displayedAuthors} 位
                    </span>
                )}
            </div>
            <div style={{ height: `${chartHeight}px` }}>
                {loading && topAuthors.length === 0 ? (
                    <div className="flex justify-center h-full items-center text-gray-500">
                        載入中...
                    </div>
                ) : topAuthors.length === 0 ? (
                    <div className="flex justify-center h-full items-center text-gray-500">
                        無資料
                    </div>
                ) : (
                    <Bar data={chartData} options={chartOptions} />
                )}
            </div>
        </div>
    );
};

export default AuthorStatsPanel;
