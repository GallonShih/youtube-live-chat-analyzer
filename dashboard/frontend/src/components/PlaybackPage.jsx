import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { registerChartComponents, hourGridPlugin } from '../utils/chartSetup';

registerChartComponents();

const API_BASE_URL = 'http://localhost:8000';

const DateTimeHourSelector = ({ label, value, onChange, max }) => {
    const datePart = value ? value.split('T')[0] : '';
    const hourPart = value ? value.split('T')[1]?.substring(0, 2) : '00';
    const maxDate = max ? max.split('T')[0] : undefined;

    const allHours = useMemo(() => Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')), []);

    const availableHours = useMemo(() => {
        if (!max || !datePart) return allHours;
        if (datePart < maxDate) return allHours;
        if (datePart === maxDate) {
            const maxHour = parseInt(max.split('T')[1].substring(0, 2), 10);
            return allHours.filter(h => parseInt(h, 10) <= maxHour);
        }
        return [];
    }, [max, datePart, maxDate, allHours]);

    const handleDateChange = (e) => {
        const newDate = e.target.value;
        if (!newDate) {
            onChange('');
            return;
        }
        let newHour = hourPart;
        // If date changes to maxDate, ensure hour is within limit
        if (max && newDate === maxDate) {
            const maxHourStr = max.split('T')[1].substring(0, 2);
            if (parseInt(newHour, 10) > parseInt(maxHourStr, 10)) {
                newHour = maxHourStr;
            }
        }
        onChange(`${newDate}T${newHour}:00`);
    };

    const handleHourChange = (e) => {
        const newHour = e.target.value;
        if (!datePart) return;
        onChange(`${datePart}T${newHour}:00`);
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <div className="flex gap-2">
                <input
                    type="date"
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={datePart}
                    onChange={handleDateChange}
                    max={maxDate}
                />
                <select
                    className="w-24 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={hourPart}
                    onChange={handleHourChange}
                    disabled={!datePart}
                >
                    {availableHours.map(h => (
                        <option key={h} value={h}>{h}:00</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

function PlaybackPage() {
    // Configuration state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [stepSeconds, setStepSeconds] = useState(300); // 5 minutes default
    const [playbackSpeed, setPlaybackSpeed] = useState(1); // seconds per step

    // Playback state
    const [snapshots, setSnapshots] = useState([]);
    const [metadata, setMetadata] = useState(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Refs for playback control
    const playIntervalRef = useRef(null);
    const currentSnapshotRef = useRef(null);

    // Step options
    const stepOptions = [
        { value: 60, label: '1 分鐘' },
        { value: 300, label: '5 分鐘' },
        { value: 900, label: '15 分鐘' },
        { value: 1800, label: '30 分鐘' },
        { value: 3600, label: '1 小時' },
    ];

    // Speed options (seconds per step)
    const speedOptions = [
        { value: 2, label: '0.5x' },
        { value: 1, label: '1x' },
        { value: 0.5, label: '2x' },
        { value: 0.25, label: '4x' },
    ];

    // Fetch snapshots
    const loadSnapshots = async () => {
        if (!startDate || !endDate) {
            setError('請選擇開始和結束時間');
            return;
        }

        setIsLoading(true);
        setError(null);
        setIsPlaying(false);

        try {
            const startIso = new Date(startDate).toISOString();
            const endIso = new Date(endDate).toISOString();

            const params = new URLSearchParams({
                start_time: startIso,
                end_time: endIso,
                step_seconds: stepSeconds.toString()
            });

            const response = await fetch(`${API_BASE_URL}/api/playback/snapshots?${params}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setSnapshots(data.snapshots);
            setMetadata(data.metadata);
            setCurrentIndex(0);
        } catch (err) {
            console.error('Error loading snapshots:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Playback control
    const togglePlayback = useCallback(() => {
        if (snapshots.length === 0) return;
        setIsPlaying(prev => !prev);
    }, [snapshots.length]);

    // Handle playback
    useEffect(() => {
        if (isPlaying && snapshots.length > 0) {
            playIntervalRef.current = setInterval(() => {
                setCurrentIndex(prev => {
                    if (prev >= snapshots.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, playbackSpeed * 1000);
        } else {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
                playIntervalRef.current = null;
            }
        }

        return () => {
            if (playIntervalRef.current) {
                clearInterval(playIntervalRef.current);
            }
        };
    }, [isPlaying, playbackSpeed, snapshots.length]);

    // Current snapshot data
    const currentSnapshot = snapshots[currentIndex] || null;

    // Keep ref in sync for plugin access
    currentSnapshotRef.current = currentSnapshot;

    // Get data up to current index for progressive display
    const visibleSnapshots = snapshots.slice(0, currentIndex + 1);

    // Format helpers
    const formatNumber = (num) => {
        if (num === null || num === undefined) return '--';
        return new Intl.NumberFormat('zh-TW').format(num);
    };

    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return '--';
        return new Intl.NumberFormat('zh-TW', {
            style: 'currency',
            currency: 'TWD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const formatTimestamp = (isoString) => {
        if (!isoString) return '--';
        const date = new Date(isoString);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const formatLocalHour = (date) => {
        const d = new Date(date);
        d.setMinutes(0, 0, 0);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    };

    // Prepare viewer data (line chart)
    const viewerData = useMemo(() => visibleSnapshots
        .filter(s => s.viewer_count !== null)
        .map(s => ({
            x: new Date(s.timestamp).getTime(),
            y: s.viewer_count
        })), [visibleSnapshots]);

    // Prepare hourly message data (bar chart) - aggregate by hour
    const hourlyMessageData = useMemo(() => {
        const hourMap = {};
        visibleSnapshots.forEach(s => {
            const hourKey = new Date(s.timestamp);
            hourKey.setMinutes(0, 0, 0);
            const key = hourKey.getTime();
            // Use the max message count for that hour
            if (!hourMap[key] || s.hourly_messages > hourMap[key]) {
                hourMap[key] = s.hourly_messages;
            }
        });
        return Object.entries(hourMap).map(([timestamp, count]) => ({
            // Center bar in hour slot (add 30 minutes)
            x: parseInt(timestamp) + 30 * 60 * 1000,
            y: count
        }));
    }, [visibleSnapshots]);

    // Dual Axis Chart Config - matching Dashboard.jsx style
    const chartData = useMemo(() => ({
        datasets: [
            {
                type: 'line',
                label: '即時觀看人數',
                data: viewerData,
                borderColor: '#5470C6',
                backgroundColor: 'rgba(84,112,198,0.2)',
                tension: 0.4,
                pointRadius: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return index === count - 1 ? 5 : 0;
                },
                pointBackgroundColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return index === count - 1 ? '#ff4d4f' : '#5470C6';
                },
                pointBorderColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return index === count - 1 ? '#ff4d4f' : '#5470C6';
                },
                pointHoverRadius: 8,
                yAxisID: 'y1',
                order: 1,
            },
            {
                type: 'bar',
                label: '每小時留言數',
                data: hourlyMessageData,
                backgroundColor: (ctx) => {
                    if (!hourlyMessageData.length || !ctx.raw) return '#91cc75';
                    const maxX = hourlyMessageData[hourlyMessageData.length - 1]?.x;
                    if (ctx.raw.x === maxX) {
                        return '#ff4d4f';
                    }
                    return '#91cc75';
                },
                borderWidth: 1,
                yAxisID: 'y2',
                order: 2,
            },
        ],
    }), [viewerData, hourlyMessageData]);

    // Get time range for chart
    const timeRange = snapshots.length > 0 ? {
        min: new Date(snapshots[0].timestamp).getTime(),
        max: new Date(snapshots[snapshots.length - 1].timestamp).getTime()
    } : { min: undefined, max: undefined };

    // Custom Plugin to draw Grid Lines at Top of Hour (matching Dashboard)
    // imported from utils

    // Current position indicator plugin
    const currentPositionPlugin = useMemo(() => ({
        id: 'currentPosition',
        afterDraw: (chart) => {
            const snapshot = currentSnapshotRef.current;
            if (!snapshot) return;

            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y1;

            const currentTime = new Date(snapshot.timestamp).getTime();
            const x = xAxis.getPixelForValue(currentTime);

            if (x >= xAxis.left && x <= xAxis.right) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#ff4d4f';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.moveTo(x, yAxis.top);
                ctx.lineTo(x, yAxis.bottom);
                ctx.stroke();

                // Draw time label at top
                ctx.fillStyle = '#ff4d4f';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                const date = new Date(snapshot.timestamp);
                const pad = n => n.toString().padStart(2, '0');
                const timeLabel = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
                ctx.fillText(timeLabel, x, yAxis.top - 8);

                ctx.restore();
            }
        }
    }), []); // Dependencies empty because it uses ref

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false,
        },
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Playback Analytics' },
            tooltip: {
                enabled: true,
                callbacks: {
                    title: (items) => {
                        if (items.length === 0) return '';
                        const timestamp = items[0].raw.x;
                        const date = new Date(timestamp);
                        const pad = n => n.toString().padStart(2, '0');
                        return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
                    },
                    label: (item) => {
                        const label = item.dataset.label || '';
                        return `${label}: ${formatNumber(item.raw.y)}`;
                    }
                }
            },
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'hour',
                    displayFormats: { hour: 'MM/dd HH:mm' }
                },
                ticks: {
                    source: 'auto',
                    autoSkip: false
                },
                min: timeRange.min,
                max: timeRange.max,
                grid: { display: false },
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: 'Viewers' },
                grid: { display: true },
                beginAtZero: true,
            },
            y2: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'Comments' },
                grid: { drawOnChartArea: false },
                beginAtZero: true,
            },
        },
        animation: false,
    }), [timeRange]);

    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {/* Header with Navigation */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">▶️ Playback Mode</h1>

                    <div className="flex gap-3">
                        <Link
                            to="/"
                            className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 transition-all duration-200 hover:shadow-lg"
                        >
                            📊 Dashboard
                        </Link>
                        <Link
                            to="/playback"
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all duration-200 hover:shadow-lg"
                        >
                            ▶️ Playback
                        </Link>
                        <Link
                            to="/admin"
                            className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 transition-all duration-200 hover:shadow-lg"
                        >
                            ⚙️ Admin Panel
                        </Link>
                    </div>
                </div>

                {/* Configuration Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">🎬 回放設定</h2>

                    <div className="grid grid-cols-12 gap-4">
                        {/* Start Time */}
                        <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <DateTimeHourSelector
                                label="開始時間"
                                value={startDate}
                                onChange={setStartDate}
                            />
                        </div>

                        {/* End Time */}
                        <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <DateTimeHourSelector
                                label="結束時間"
                                value={endDate}
                                onChange={setEndDate}
                                max={formatLocalHour(new Date())}
                            />
                        </div>

                        {/* Step Interval */}
                        <div className="col-span-12 md:col-span-4 lg:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">步進間隔</label>
                            <select
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={stepSeconds}
                                onChange={(e) => setStepSeconds(Number(e.target.value))}
                            >
                                {stepOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Playback Speed */}
                        <div className="col-span-12 md:col-span-4 lg:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">播放速度</label>
                            <select
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                            >
                                {speedOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Load Button */}
                        <div className="col-span-12 md:col-span-4 lg:col-span-2 flex items-end">
                            <button
                                onClick={loadSnapshots}
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-md text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg"
                            >
                                {isLoading ? '載入中...' : '📥 載入資料'}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                            ⚠️ {error}
                        </div>
                    )}
                </div>

                {/* Playback Controls & Chart */}
                {snapshots.length > 0 && (
                    <>
                        {/* Playback Controls */}
                        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                            <div className="flex flex-col items-center space-y-4">
                                {/* Time Display */}
                                <div className="text-center">
                                    <div className="text-3xl font-bold text-gray-800">
                                        {formatTimestamp(currentSnapshot?.timestamp)}
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        Frame {currentIndex + 1} / {snapshots.length}
                                    </div>
                                </div>

                                {/* Controls Row */}
                                <div className="flex items-center gap-4 w-full max-w-2xl">
                                    {/* Play/Pause Button */}
                                    <button
                                        onClick={togglePlayback}
                                        className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all duration-200 ${isPlaying
                                            ? 'bg-red-500 hover:bg-red-600 text-white'
                                            : 'bg-green-500 hover:bg-green-600 text-white'
                                            }`}
                                    >
                                        {isPlaying ? '⏸' : '▶️'}
                                    </button>

                                    {/* Progress Slider */}
                                    <div className="flex-1">
                                        <input
                                            type="range"
                                            min="0"
                                            max={snapshots.length - 1}
                                            value={currentIndex}
                                            onChange={(e) => {
                                                setCurrentIndex(Number(e.target.value));
                                                setIsPlaying(false);
                                            }}
                                            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        />
                                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                                            <span>{formatTimestamp(snapshots[0]?.timestamp)}</span>
                                            <span>{formatTimestamp(snapshots[snapshots.length - 1]?.timestamp)}</span>
                                        </div>
                                    </div>

                                    {/* Speed Badge */}
                                    <div className="bg-gray-200 px-3 py-1 rounded-full text-sm font-medium text-gray-700">
                                        {speedOptions.find(o => o.value === playbackSpeed)?.label || '1x'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Main Chart - Dual Axis like Dashboard */}
                        <div className="bg-white p-6 rounded-lg shadow-md mb-6 h-[50vh]">
                            <Chart
                                type='bar'
                                options={chartOptions}
                                data={chartData}
                                plugins={[hourGridPlugin, currentPositionPlugin]}
                            />
                        </div>

                        {/* Stats Display */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            {/* Viewer Count */}
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-md p-6 border border-blue-200">
                                <div className="text-sm font-medium text-blue-700 mb-2">👥 觀看人數</div>
                                <div className="text-4xl font-bold text-blue-900">
                                    {formatNumber(currentSnapshot?.viewer_count)}
                                </div>
                            </div>

                            {/* Hourly Messages */}
                            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-md p-6 border border-green-200">
                                <div className="text-sm font-medium text-green-700 mb-2">💬 每小時留言</div>
                                <div className="text-4xl font-bold text-green-900">
                                    {formatNumber(currentSnapshot?.hourly_messages)}
                                </div>
                            </div>

                            {/* Paid Messages */}
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow-md p-6 border border-purple-200">
                                <div className="text-sm font-medium text-purple-700 mb-2">💰 SC 數量</div>
                                <div className="text-4xl font-bold text-purple-900">
                                    {formatNumber(currentSnapshot?.paid_message_count)}
                                </div>
                            </div>

                            {/* Revenue */}
                            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-md p-6 border border-amber-200">
                                <div className="text-sm font-medium text-amber-700 mb-2">💵 營收 (TWD)</div>
                                <div className="text-4xl font-bold text-amber-900">
                                    {formatCurrency(currentSnapshot?.revenue_twd)}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Empty State */}
                {snapshots.length === 0 && !isLoading && (
                    <div className="bg-white p-12 rounded-lg shadow-md text-center">
                        <div className="text-6xl mb-4">🎬</div>
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">設定時間範圍開始回放</h3>
                        <p className="text-gray-500">選擇開始和結束時間，然後點擊「載入資料」按鈕</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PlaybackPage;
