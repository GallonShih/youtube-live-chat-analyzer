import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import { Link } from 'react-router-dom';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { registerChartComponents, hourGridPlugin } from '../../utils/chartSetup';
import DynamicWordCloud from '../../components/common/DynamicWordCloud';
import BarChartRace from '../../components/common/BarChartRace';
import DateTimeHourSelector from '../../components/common/DateTimeHourSelector';
import { formatNumber, formatCurrency, formatTimestamp, formatLocalHour } from '../../utils/formatters';
import { usePlayback } from '../../hooks/usePlayback';
import { useWordlists } from '../../hooks/useWordlists';
import { useReplacementWordlists } from '../../hooks/useReplacementWordlists';
import { usePlaybackLayout } from '../../hooks/usePlaybackLayout';

registerChartComponents();

function PlaybackPage() {
    // Configuration state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [stepSeconds, setStepSeconds] = useState(300); // 5 minutes default
    const [playbackSpeed, setPlaybackSpeed] = useState(1); // seconds per step

    // Hooks
    const {
        snapshots,
        metadata,
        currentIndex,
        setCurrentIndex,
        isPlaying,
        setIsPlaying,
        isLoading,
        error,
        wordcloudSnapshots,
        wordcloudLoading,
        wordcloudError,
        loadSnapshots,
        loadWordcloudSnapshots,
        togglePlayback
    } = usePlayback();

    const { savedWordlists: savedExclusionWordlists, loading: loadingExclusionWordlists } = useWordlists();
    const { savedWordlists: savedReplacementWordlists, loading: loadingReplacementWordlists } = useReplacementWordlists();
    const { layout, handleLayoutChange, resetLayout } = usePlaybackLayout();

    // Word cloud config state
    const [windowHours, setWindowHours] = useState(4);
    const [wordLimit, setWordLimit] = useState(30);
    const [selectedWordlistId, setSelectedWordlistId] = useState(null);
    const [selectedReplacementWordlistId, setSelectedReplacementWordlistId] = useState(null);

    // Refs
    const playIntervalRef = useRef(null);
    const currentSnapshotRef = useRef(null);

    // Grid layout width measurement
    const { width: gridWidth, containerRef: gridContainerRef, mounted: gridMounted } = useContainerWidth();

    // Step options
    const stepOptions = [
        { value: 60, label: '1 分鐘' },
        { value: 300, label: '5 分鐘' },
        { value: 900, label: '15 分鐘' },
        { value: 1800, label: '30 分鐘' },
        { value: 3600, label: '1 小時' },
    ];

    // Speed options
    const speedOptions = [
        { value: 2, label: '0.5x' },
        { value: 1, label: '1x' },
        { value: 0.5, label: '2x' },
        { value: 0.25, label: '4x' },
        { value: 0.125, label: '8x' },
        { value: 0.0625, label: '16x' },
    ];

    // Window hours options
    const windowHoursOptions = [
        { value: 1, label: '1 小時' },
        { value: 4, label: '4 小時' },
        { value: 8, label: '8 小時' },
        { value: 12, label: '12 小時' },
        { value: 24, label: '24 小時' },
    ];

    // Word limit options
    const wordLimitOptions = [
        { value: 10, label: '10' },
        { value: 20, label: '20' },
        { value: 30, label: '30' },
        { value: 50, label: '50' },
        { value: 100, label: '100' },
    ];

    // Handle load button
    const handleLoad = async () => {
        if (!startDate || !endDate) return;

        await loadSnapshots({ startDate, endDate, stepSeconds });
        await loadWordcloudSnapshots({
            startDate,
            endDate,
            stepSeconds,
            windowHours,
            wordLimit,
            wordlistId: selectedWordlistId,
            replacementWordlistId: selectedReplacementWordlistId
        });
    };

    // Handle playback interval
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
    }, [isPlaying, playbackSpeed, snapshots.length, setCurrentIndex, setIsPlaying]);

    // Current snapshot data
    const currentSnapshot = snapshots[currentIndex] || null;
    currentSnapshotRef.current = currentSnapshot;

    // Derived data
    const visibleSnapshots = snapshots.slice(0, currentIndex + 1);
    const currentWordcloudWords = wordcloudSnapshots[currentIndex]?.words || [];

    // Prepare charts data
    // Viewer Data
    const viewerData = useMemo(() => visibleSnapshots
        .filter(s => s.viewer_count !== null)
        .map(s => ({
            x: new Date(s.timestamp).getTime(),
            y: s.viewer_count
        })), [visibleSnapshots]);

    // Hourly Message Data
    const hourlyMessageData = useMemo(() => {
        const hourMap = {};
        visibleSnapshots.forEach(s => {
            const date = new Date(s.timestamp);
            if (date.getMinutes() === 0 && date.getSeconds() === 0) {
                date.setHours(date.getHours() - 1);
            }
            date.setMinutes(0, 0, 0);
            const key = date.getTime();
            if (!hourMap[key] || s.hourly_messages > hourMap[key]) {
                hourMap[key] = s.hourly_messages;
            }
        });
        return Object.entries(hourMap).map(([timestamp, count]) => ({
            x: parseInt(timestamp) + 30 * 60 * 1000,
            y: count
        }));
    }, [visibleSnapshots]);

    // Chart Data
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
                    if (ctx.raw.x === maxX) return '#ff4d4f';
                    return '#91cc75';
                },
                borderWidth: 1,
                yAxisID: 'y2',
                order: 2,
            },
        ],
    }), [viewerData, hourlyMessageData]);

    // Max values
    const { maxViewerCount, maxMessageCount } = useMemo(() => {
        if (!snapshots.length) return { maxViewerCount: 0, maxMessageCount: 0 };
        const maxV = Math.max(...snapshots.map(s => s.viewer_count || 0));
        const maxM = Math.max(...snapshots.map(s => s.hourly_messages || 0));
        return { maxViewerCount: maxV, maxMessageCount: maxM };
    }, [snapshots]);

    // Time range
    const timeRange = snapshots.length > 0 ? {
        min: new Date(snapshots[0].timestamp).getTime(),
        max: new Date(snapshots[snapshots.length - 1].timestamp).getTime()
    } : { min: undefined, max: undefined };

    // Plugins
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
    }), []);

    // Chart options
    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
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
                time: { unit: 'hour', displayFormats: { hour: 'MM/dd HH:mm' } },
                ticks: { source: 'auto', autoSkip: false },
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
                suggestedMax: maxViewerCount * 1.1,
            },
            y2: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'Comments' },
                grid: { drawOnChartArea: false },
                beginAtZero: true,
                suggestedMax: maxMessageCount * 1.1,
                ticks: { precision: 0 }
            },
        },
        animation: false,
    }), [timeRange, maxViewerCount, maxMessageCount]);


    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">▶️ Playback Mode</h1>
                    <div className="flex gap-3">
                        <Link to="/" className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 hover:shadow-lg">📊 Dashboard</Link>
                        <Link to="/playback" className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 hover:shadow-lg">▶️ Playback</Link>
                        <Link to="/admin" className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 hover:shadow-lg">⚙️ Admin Panel</Link>
                    </div>
                </div>

                {/* Configuration Panel */}
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-lg font-semibold text-gray-800 mb-4">🎬 回放設定</h2>

                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <DateTimeHourSelector
                                label="開始時間"
                                value={startDate}
                                onChange={setStartDate}
                                max={formatLocalHour(new Date())}
                            />
                        </div>
                        <div className="col-span-12 md:col-span-6 lg:col-span-3">
                            <DateTimeHourSelector
                                label="結束時間"
                                value={endDate}
                                onChange={setEndDate}
                                max={formatLocalHour(new Date())}
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4 lg:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">步進間隔</label>
                            <select
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                value={stepSeconds}
                                onChange={(e) => setStepSeconds(Number(e.target.value))}
                            >
                                {stepOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="col-span-12 md:col-span-4 lg:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">播放速度</label>
                            <select
                                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                value={playbackSpeed}
                                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                            >
                                {speedOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                        </div>
                        <div className="col-span-12 md:col-span-4 lg:col-span-2 flex items-end">
                            <button
                                onClick={handleLoad}
                                disabled={isLoading}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-md text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg"
                            >
                                {isLoading ? '載入中...' : '📥 載入資料'}
                            </button>
                        </div>
                    </div>

                    {/* Word Cloud Settings */}
                    <div className="mt-6 pt-4 border-t-2 border-dashed border-gray-200">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xl">☁️</span>
                                <h3 className="text-base font-bold text-slate-700">文字雲進階設定 (下列選項僅影響文字雲顯示)</h3>
                            </div>
                            <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-12 md:col-span-6 lg:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">統計窗口</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        value={windowHours}
                                        onChange={(e) => setWindowHours(Number(e.target.value))}
                                    >
                                        {windowHoursOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-12 md:col-span-6 lg:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">顯示詞數</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        value={wordLimit}
                                        onChange={(e) => setWordLimit(Number(e.target.value))}
                                    >
                                        {wordLimitOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-12 md:col-span-6 lg:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">排除清單</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        value={selectedWordlistId || ''}
                                        onChange={(e) => setSelectedWordlistId(e.target.value ? parseInt(e.target.value) : null)}
                                        disabled={loadingExclusionWordlists}
                                    >
                                        <option value="">⛔️ 不使用清單</option>
                                        {savedExclusionWordlists.map(wl => <option key={wl.id} value={wl.id}>{wl.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-12 md:col-span-6 lg:col-span-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">取代清單</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        value={selectedReplacementWordlistId || ''}
                                        onChange={(e) => setSelectedReplacementWordlistId(e.target.value ? parseInt(e.target.value) : null)}
                                        disabled={loadingReplacementWordlists}
                                    >
                                        <option value="">🔀 不使用清單</option>
                                        {savedReplacementWordlists.map(wl => <option key={wl.id} value={wl.id}>{wl.name}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-12">
                                    <p className="text-xs text-gray-400">* 統計窗口已設為 {windowHours} 小時，將計算每一步驟前 {windowHours} 小時內的熱門詞彙</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">⚠️ {error}</div>}
                </div>

                {/* Content */}
                {snapshots.length > 0 && (
                    <>
                        {/* Draggable Chart Blocks */}
                        <div className="mb-6" ref={gridContainerRef}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-lg font-semibold text-gray-700">📊 視覺化區塊 <span className="text-sm font-normal text-gray-400">(可拖曳排列與縮放)</span></h2>
                                <button
                                    onClick={resetLayout}
                                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                >
                                    🔄 重置佈局
                                </button>
                            </div>
                            {gridMounted && (
                                <Responsive
                                    width={gridWidth}
                                    layouts={{ lg: layout, md: layout, sm: layout }}
                                    breakpoints={{ lg: 1200, md: 996, sm: 768 }}
                                    cols={{ lg: 12, md: 12, sm: 1 }}
                                    rowHeight={30}
                                    onLayoutChange={(currentLayout) => handleLayoutChange(currentLayout)}
                                    draggableHandle=".drag-handle"
                                    isResizable={true}
                                    isDraggable={true}
                                    margin={[16, 16]}
                                >
                                    {/* Controls / Time Player */}
                                    <div key="controls" className="bg-white rounded-lg shadow-md overflow-hidden">
                                        <div className="drag-handle cursor-move flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <span className="text-gray-400 select-none">⋮⋮</span>
                                            <h3 className="text-base font-bold text-gray-800">⏱️ 時間播放器</h3>
                                        </div>
                                        <div className="p-4 h-[calc(100%-52px)] flex flex-col justify-center">
                                            <div className="flex flex-col items-center space-y-3">
                                                <div className="text-center">
                                                    <div className="text-2xl font-bold text-gray-800">{formatTimestamp(currentSnapshot?.timestamp)}</div>
                                                    <div className="text-sm text-gray-500">Frame {currentIndex + 1} / {snapshots.length}</div>
                                                </div>
                                                <div className="flex items-center gap-4 w-full max-w-2xl">
                                                    <button
                                                        onClick={togglePlayback}
                                                        className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-lg transition-all duration-200 ${isPlaying ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                                                    >
                                                        {isPlaying ? '⏸' : '▶️'}
                                                    </button>
                                                    <div
                                                        className="flex-1"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                        onPointerDown={(e) => e.stopPropagation()}
                                                    >
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max={snapshots.length - 1}
                                                            value={currentIndex}
                                                            onChange={(e) => { setCurrentIndex(Number(e.target.value)); setIsPlaying(false); }}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                        />
                                                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                            <span>{formatTimestamp(snapshots[0]?.timestamp)}</span>
                                                            <span>{formatTimestamp(snapshots[snapshots.length - 1]?.timestamp)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-200 px-3 py-1 rounded-full text-sm font-medium text-gray-700">{speedOptions.find(o => o.value === playbackSpeed)?.label || '1x'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Cards */}
                                    <div key="stats" className="bg-white rounded-lg shadow-md overflow-hidden">
                                        <div className="drag-handle cursor-move flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <span className="text-gray-400 select-none">⋮⋮</span>
                                            <h3 className="text-base font-bold text-gray-800">📈 即時統計</h3>
                                        </div>
                                        <div className="p-4 h-[calc(100%-52px)]">
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-full">
                                                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 border border-blue-200 flex flex-col justify-center">
                                                    <div className="text-xs font-medium text-blue-700 mb-1">� 觀看人數</div>
                                                    <div className="text-2xl font-bold text-blue-900">{formatNumber(currentSnapshot?.viewer_count)}</div>
                                                </div>
                                                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 border border-green-200 flex flex-col justify-center">
                                                    <div className="text-xs font-medium text-green-700 mb-1">� 每小時留言</div>
                                                    <div className="text-2xl font-bold text-green-900">{formatNumber(currentSnapshot?.hourly_messages)}</div>
                                                </div>
                                                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3 border border-purple-200 flex flex-col justify-center">
                                                    <div className="text-xs font-medium text-purple-700 mb-1">💰 SC 數量</div>
                                                    <div className="text-2xl font-bold text-purple-900">{formatNumber(currentSnapshot?.paid_message_count)}</div>
                                                </div>
                                                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-3 border border-amber-200 flex flex-col justify-center">
                                                    <div className="text-xs font-medium text-amber-700 mb-1">💵 營收 (TWD)</div>
                                                    <div className="text-2xl font-bold text-amber-900">{formatCurrency(currentSnapshot?.revenue_twd)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Main Chart */}
                                    <div key="chart" className="bg-white rounded-lg shadow-md overflow-hidden">
                                        <div className="drag-handle cursor-move flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <span className="text-gray-400 select-none">⋮⋮</span>
                                            <h3 className="text-base font-bold text-gray-800">📈 觀看人數與留言趨勢</h3>
                                        </div>
                                        <div className="p-4 h-[calc(100%-52px)]">
                                            <Chart type='bar' options={chartOptions} data={chartData} plugins={[hourGridPlugin, currentPositionPlugin]} />
                                        </div>
                                    </div>

                                    {/* Dynamic Word Cloud */}
                                    <div key="wordcloud" className="bg-white rounded-lg shadow-md overflow-visible">
                                        <div className="drag-handle cursor-move flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <span className="text-gray-400 select-none">⋮⋮</span>
                                            <h3 className="text-base font-bold text-gray-800">☁️ 動態文字雲</h3>
                                            <span className="ml-auto text-xs text-gray-400">
                                                {currentSnapshot
                                                    ? (() => {
                                                        const end = new Date(currentSnapshot.timestamp);
                                                        const start = new Date(end.getTime() - windowHours * 60 * 60 * 1000);
                                                        const pad = n => n.toString().padStart(2, '0');
                                                        const fmt = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                                        return `${fmt(start)} - ${fmt(end)}`;
                                                    })()
                                                    : '--'}
                                            </span>
                                        </div>
                                        <div className="p-4 h-[calc(100%-52px)]">
                                            {wordcloudLoading && !wordcloudSnapshots.length ? (
                                                <div className="h-full flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
                                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-500"></div>
                                                </div>
                                            ) : wordcloudError ? (
                                                <div className="h-full flex items-center justify-center bg-red-50 rounded-2xl border border-red-200 text-red-600">
                                                    ⚠️ {wordcloudError}
                                                </div>
                                            ) : (
                                                <DynamicWordCloud
                                                    words={currentWordcloudWords}
                                                    wordLimit={wordLimit}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Bar Chart Race */}
                                    <div key="barrace" className="bg-white rounded-lg shadow-md overflow-hidden">
                                        <div className="drag-handle cursor-move flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <span className="text-gray-400 select-none">⋮⋮</span>
                                            <h3 className="text-base font-bold text-gray-800">🏆 熱門詞彙排行</h3>
                                        </div>
                                        <div className="p-4 h-[calc(100%-52px)]">
                                            {wordcloudLoading && !wordcloudSnapshots.length ? (
                                                <div className="h-full flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-200">
                                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-500"></div>
                                                </div>
                                            ) : wordcloudError ? (
                                                <div className="h-full flex items-center justify-center bg-red-50 rounded-2xl border border-red-200 text-red-600">
                                                    ⚠️ {wordcloudError}
                                                </div>
                                            ) : (
                                                <BarChartRace
                                                    words={currentWordcloudWords}
                                                    barLimit={10}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </Responsive>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default PlaybackPage;
