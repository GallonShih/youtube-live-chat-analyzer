import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    TimeScale
);

/**
 * Renders a single line chart for a word trend group
 */
const TrendChart = ({
    name,
    color,
    data,
    startTime,
    endTime,
    lineWidth = 2,
    showPoints = true,
    chartHeight = 192,
    minimalStyle = false,
    minimalYAxisTickSize = 16,
    dragHandleProps
}) => {
    const formatYAxisTick = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return value;
        if (Math.abs(n) < 1000) return `${n}`;
        const kValue = Math.round((n / 1000) * 10) / 10;
        return `${kValue.toFixed(1).replace(/\.0$/, '')}k`;
    };

    // Fill missing hours with 0
    const filledData = useMemo(() => {
        if (data.length === 0) return data;

        let start, end;

        if (startTime && endTime) {
            // Use provided time range
            start = new Date(startTime);
            end = new Date(endTime);
        } else {
            // Default to last 24 hours
            end = new Date();
            start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        }

        start.setMinutes(0, 0, 0);
        end.setMinutes(0, 0, 0);

        // Create a map of existing data
        const dataMap = new Map();
        data.forEach(d => {
            const hourKey = new Date(d.hour);
            hourKey.setMinutes(0, 0, 0);
            dataMap.set(hourKey.getTime(), d.count);
        });

        // Fill all hours in range
        const filled = [];
        const current = new Date(start);
        while (current <= end) {
            const key = current.getTime();
            filled.push({
                hour: current.toISOString(),
                count: dataMap.get(key) || 0
            });
            current.setHours(current.getHours() + 1);
        }

        return filled;
    }, [data, startTime, endTime]);

    const chartData = useMemo(() => ({
        datasets: [
            {
                label: name,
                data: filledData.map(d => ({
                    x: new Date(d.hour).getTime(),
                    y: d.count
                })),
                borderColor: color,
                backgroundColor: 'transparent',
                tension: 0.3,
                fill: false,
                pointRadius: showPoints ? 3 : 0,
                pointHoverRadius: showPoints ? 6 : 0,
                pointBackgroundColor: color,
                pointBorderColor: color,
                pointBorderWidth: 1,
                borderWidth: lineWidth,
            }
        ]
    }), [name, color, filledData, lineWidth, showPoints]);

    const chartOptions = useMemo(() => {
        // Calculate min/max from data or use provided times
        let minTime, maxTime;

        if (startTime && endTime) {
            minTime = new Date(startTime).getTime();
            maxTime = new Date(endTime).getTime();
        } else if (data.length > 0) {
            const times = data.map(d => new Date(d.hour).getTime());
            minTime = Math.min(...times) - 30 * 60 * 1000; // 30min padding
            maxTime = Math.max(...times) + 30 * 60 * 1000;
        } else {
            const now = new Date();
            maxTime = now.getTime();
            minTime = maxTime - 24 * 60 * 60 * 1000; // Default 24h
        }

        const rawMax = data.length > 0 ? Math.max(...data.map(d => d.count)) : 0;

        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            layout: {
                padding: {
                    top: minimalStyle ? 10 : 0,
                    right: 0,
                    bottom: 0,
                    left: 0
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13 },
                    bodyFont: { size: 12 },
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const date = new Date(items[0].raw.x);
                            const pad = n => n.toString().padStart(2, '0');
                            return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:00 - ${pad(date.getHours())}:59`;
                        },
                        label: (item) => `留言數: ${item.raw.y}`
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        displayFormats: {
                            hour: 'MM/dd HH:mm'
                        }
                    },
                    min: minTime,
                    max: maxTime,
                    grid: { display: false },
                    ticks: {
                        display: !minimalStyle,
                        source: 'auto',
                        autoSkip: true,
                        maxTicksLimit: 12,
                        font: { size: 11 }
                    }
                },
                y: {
                    beginAtZero: true,
                    grace: minimalStyle ? '12%' : 0,
                    suggestedMax: minimalStyle
                        ? (rawMax > 0 ? Math.ceil(rawMax * 1.12) : 1)
                        : undefined,
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        includeBounds: true,
                        callback: (value, index, ticks) => {
                            if (!minimalStyle) return formatYAxisTick(value);
                            return index === ticks.length - 1 ? formatYAxisTick(value) : '';
                        },
                        precision: 0,
                        font: {
                            size: minimalStyle ? minimalYAxisTickSize : 11,
                            weight: minimalStyle ? '700' : '400'
                        }
                    },
                    title: {
                        display: !minimalStyle,
                        text: '留言數',
                        font: { size: 12 }
                    }
                }
            }
        };
    }, [data, startTime, endTime, minimalStyle, minimalYAxisTickSize]);

    // Calculate total and max for this period
    const stats = useMemo(() => {
        if (!data.length) return { total: 0, max: 0, maxHour: null };
        const total = data.reduce((sum, d) => sum + d.count, 0);
        const maxEntry = data.reduce((max, d) => d.count > max.count ? d : max, data[0]);
        return {
            total,
            max: maxEntry.count,
            maxHour: maxEntry.hour
        };
    }, [data]);

    const formatMaxHour = (hour) => {
        if (!hour) return '-';
        const date = new Date(hour);
        const pad = n => n.toString().padStart(2, '0');
        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:00`;
    };

    return (
        <div className="bg-white rounded-xl shadow-md p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    {/* Drag handle */}
                    <span
                        {...dragHandleProps}
                        className="cursor-move text-gray-400 hover:text-gray-600 select-none"
                        title="拖曳以調整順序"
                    >
                        ⋮⋮
                    </span>
                    <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: color }}
                    />
                    <h3 className="text-lg font-semibold text-gray-800">{name}</h3>
                </div>
                <div className="flex gap-4 text-sm text-gray-600">
                    <span>總計: <strong className="text-gray-900">{stats.total.toLocaleString()}</strong></span>
                    <span>最高: <strong className="text-gray-900">{stats.max.toLocaleString()}</strong> ({formatMaxHour(stats.maxHour)})</span>
                </div>
            </div>
            <div className="min-h-[140px]" style={{ height: `${chartHeight}px` }} data-testid="trend-chart-container">
                {data.length > 0 ? (
                    <Line data={chartData} options={chartOptions} />
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        此時段無符合的留言資料
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrendChart;
