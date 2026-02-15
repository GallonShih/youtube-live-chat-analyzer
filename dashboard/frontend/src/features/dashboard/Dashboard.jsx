import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import {
    MagnifyingGlassIcon,
    XMarkIcon,
    FlagIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../../components/common/Toast';
import Navigation from '../../components/common/Navigation';
import { registerChartComponents, hourGridPlugin } from '../../utils/chartSetup';
import eventMarkerPlugin from '../../utils/eventMarkerPlugin';
import { fetchViewersStats, fetchCommentsStats } from '../../api/stats';
import { formatLocalHour } from '../../utils/formatters';

import MessageList from '../messages/MessageList';
import WordCloudPanel from '../wordcloud/WordCloudPanel';
import MoneyStats from './MoneyStats';
import EmojiStatsPanel from './EmojiStatsPanel';
import StreamInfoBar from './StreamInfoBar';
import EventMarkerModal from './EventMarkerModal';
import { useDefaultStartTime } from '../../hooks/useDefaultStartTime';

registerChartComponents();

function Dashboard() {
    const toast = useToast();
    const [viewData, setViewData] = useState([]);
    const [commentData, setCommentData] = useState([]);
    const [barFlash, setBarFlash] = useState(false);

    // Event Markers
    const [eventMarkers, setEventMarkers] = useState([]);
    const [showMarkerModal, setShowMarkerModal] = useState(false);
    const [showMarkerLabels, setShowMarkerLabels] = useState(true);
    const [markerOpacity, setMarkerOpacity] = useState(20);

    // Filter States
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [toggleRefresh, setToggleRefresh] = useState(true);

    // Default period
    const { defaultStartTime, loading: defaultPeriodLoading } = useDefaultStartTime();
    const [defaultApplied, setDefaultApplied] = useState(false);

    // Dynamic Time Axis State
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Apply default start time on load (only set startDate, keep auto-refresh on)
    useEffect(() => {
        if (defaultPeriodLoading || defaultApplied) return;
        setDefaultApplied(true);
        if (defaultStartTime) {
            setStartDate(defaultStartTime);
        }
    }, [defaultPeriodLoading, defaultStartTime, defaultApplied]);

    // Refs for auto-refresh to read latest filter values without re-creating interval
    const startDateRef = useRef(startDate);
    const endDateRef = useRef(endDate);
    useEffect(() => { startDateRef.current = startDate; }, [startDate]);
    useEffect(() => { endDateRef.current = endDate; }, [endDate]);

    const [timeAxisConfig, setTimeAxisConfig] = useState({
        type: 'time',
        time: {
            unit: 'hour',
            displayFormats: { hour: 'MM/dd HH:mm' }
        },
        ticks: {
            source: 'auto',
            autoSkip: false
        },
        min: new Date(new Date().getTime() - 12 * 60 * 60 * 1000).getTime(), // Initial rolling 12h
        max: new Date().getTime(),
    });

    const fetchViewers = async (start, end) => {
        try {
            const data = await fetchViewersStats({
                hours: (!start || !end) ? 12 : undefined,
                startTime: start,
                endTime: end
            });

            const validData = data.map(d => ({
                x: new Date(d.time).getTime(),
                y: d.count
            }));
            setViewData(validData);
        } catch (err) {
            console.error("Failed to fetch viewers", err);
        }
    };

    const fetchComments = async (start, end) => {
        try {
            const data = await fetchCommentsStats({
                hours: (!start || !end) ? 12 : undefined,
                startTime: start,
                endTime: end
            });

            const validData = data.map(d => ({
                // Shift by +30 minutes to center the bar in the hour slot
                x: new Date(d.hour).getTime() + 30 * 60 * 1000,
                y: d.count
            }));
            setCommentData(validData);

            // Flash effect only when no time filter is set
            if (!endDate) {
                setBarFlash(true);
                setTimeout(() => setBarFlash(false), 400);
            }
        } catch (err) {
            console.error("Failed to fetch comments", err);
        }
    };

    const handleFilter = () => {
        if (!startDate) {
            toast.warning('Please select start time');
            return;
        }

        const startIso = new Date(startDate).toISOString();
        const endObj = endDate ? new Date(endDate) : new Date();
        endObj.setMinutes(59, 59, 999);
        const endIso = endObj.toISOString();

        const startTs = new Date(startDate).getTime();
        const endTs = endObj.getTime();

        setTimeAxisConfig(prev => ({
            ...prev,
            min: startTs,
            max: endTs,
        }));

        setToggleRefresh(false);
        fetchViewers(startIso, endIso);
        fetchComments(startIso, endIso);
    };

    useEffect(() => {
        const doFetch = () => {
            const sd = startDateRef.current;
            const ed = endDateRef.current;
            const now = new Date();

            if (sd && !ed) {
                // Has start but no end → fetch from start to now (default period mode)
                const startIso = new Date(sd).toISOString();
                const endObj = new Date(now);
                endObj.setMinutes(59, 59, 999);
                const endIso = endObj.toISOString();

                fetchViewers(startIso, endIso);
                fetchComments(startIso, endIso);

                setTimeAxisConfig(prev => ({
                    ...prev,
                    min: new Date(sd).getTime(),
                    max: now.getTime(),
                }));
            } else {
                // No filter → 12h rolling window
                fetchViewers();
                fetchComments();

                const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
                setTimeAxisConfig(prev => ({
                    ...prev,
                    min: twelveHoursAgo.getTime(),
                    max: now.getTime(),
                }));
            }
        };

        const intervalId = setInterval(() => {
            if (toggleRefresh) doFetch();
        }, 5000);

        if (toggleRefresh) doFetch();

        return () => clearInterval(intervalId);
    }, [toggleRefresh]);

    // Dual Axis Chart Config
    const chartData = useMemo(() => ({
        datasets: [
            {
                type: 'line',
                label: '即時觀看人數',
                data: viewData,
                borderColor: '#5470C6',
                backgroundColor: 'rgba(84,112,198,0.2)',
                tension: 0.4,
                pointRadius: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return (index === count - 1 && !endDate) ? 5 : 0;
                },
                pointBackgroundColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return (index === count - 1 && !endDate) ? '#ff4d4f' : '#5470C6';
                },
                pointBorderColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    return (index === count - 1 && !endDate) ? '#ff4d4f' : '#5470C6';
                },
                pointHoverRadius: 8,
                yAxisID: 'y1',
                order: 1,
            },
            {
                type: 'bar',
                label: '每小時留言數',
                data: commentData,
                backgroundColor: (ctx) => {
                    if (!commentData.length || !ctx.raw) return '#91cc75';
                    if (!endDate) {
                        const maxX = commentData[commentData.length - 1].x;
                        if (ctx.raw.x === maxX) {
                            return barFlash ? 'rgba(255,77,79,0.5)' : '#ff4d4f';
                        }
                    }
                    return '#91cc75';
                },
                borderWidth: 1,
                yAxisID: 'y2',
                order: 2,
            },
        ],
    }), [viewData, commentData, endDate, barFlash]);

    // Chart Options
    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false,
        },
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Real-time Analytics' },
            eventMarker: {
                markers: eventMarkers.filter((m) => m.startTime && m.endTime),
                showLabels: showMarkerLabels,
                opacity: markerOpacity,
            },
            tooltip: {
                enabled: false,
                external: (context) => {
                    const { chart, tooltip } = context;
                    let tooltipEl = document.getElementById('chartjs-tooltip');

                    if (!tooltipEl) {
                        tooltipEl = document.createElement('div');
                        tooltipEl.id = 'chartjs-tooltip';
                        tooltipEl.style.background = 'rgba(0, 0, 0, 0.8)';
                        tooltipEl.style.borderRadius = '3px';
                        tooltipEl.style.color = 'white';
                        tooltipEl.style.opacity = 1;
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.position = 'absolute';
                        tooltipEl.style.transform = 'translate(-50%, 0)';
                        tooltipEl.style.transition = 'all .1s ease';
                        tooltipEl.style.padding = '8px 12px';
                        tooltipEl.style.fontFamily = 'Helvetica Neue, Helvetica, Arial, sans-serif';
                        tooltipEl.style.fontSize = '12px';
                        tooltipEl.style.zIndex = '100';
                        document.body.appendChild(tooltipEl);
                    }

                    if (tooltip.opacity === 0) {
                        tooltipEl.style.opacity = 0;
                        return;
                    }

                    if (tooltip.body) {
                        const item = tooltip.dataPoints[0];
                        const timestamp = item.raw.x;
                        const dateObj = new Date(timestamp);
                        const pad = n => n.toString().padStart(2, '0');
                        const timeStr = `${pad(dateObj.getMonth() + 1)}/${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;

                        const cDate = new Date(timestamp);
                        cDate.setMinutes(0, 0, 0);
                        const cKey = cDate.getTime() + 30 * 60 * 1000;
                        const cData = commentData.find(d => d.x === cKey);
                        const cVal = cData ? cData.y : 'NA';

                        let vVal = 'NA';
                        if (viewData.length > 0) {
                            const closestViewer = viewData.reduce((prev, curr) => {
                                return (Math.abs(curr.x - timestamp) < Math.abs(prev.x - timestamp) ? curr : prev);
                            });
                            const diff = Math.abs(closestViewer.x - timestamp);
                            if (diff <= 5 * 60 * 1000) {
                                vVal = closestViewer.y;
                            }
                        }

                        const vRow = `
                            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                <span style="display:inline-block; width:10px; height:10px; background-color:#5470C6; margin-right:6px;"></span>
                                <span>Viewers: ${vVal}</span>
                            </div>`;

                        const cHour = cDate.getHours();
                        const cRange = `${pad(cHour)}:00 - ${pad(cHour)}:59`;
                        const cRow = `
                            <div style="display: flex; align-items: center;">
                                <span style="display:inline-block; width:10px; height:10px; background-color:#91cc75; margin-right:6px;"></span>
                                <span>Comments (${cRange}): ${cVal}</span>
                            </div>`;

                        tooltipEl.innerHTML = `<div style="font-weight:bold; margin-bottom:6px;">${timeStr}</div>${vRow}${cRow}`;
                    }

                    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
                    tooltipEl.style.opacity = 1;
                    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
                    tooltipEl.style.top = positionY + tooltip.caretY + 180 + 'px';
                }
            },
        },
        scales: {
            x: {
                ...timeAxisConfig,
                grid: { display: false },
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: 'Viewers' },
                grid: { display: true },
                beginAtZero: true,
                ticks: { precision: 0 },
            },
            y2: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: 'Comments' },
                grid: { drawOnChartArea: false },
                beginAtZero: true,
                ticks: { precision: 0 },
            },
        },
    }), [timeAxisConfig, commentData, viewData, endDate, barFlash, eventMarkers, showMarkerLabels, markerOpacity]);

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {/* Header with Title and Navigation */}
                <div className="flex justify-between items-center mb-6 relative">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">YouTube Live Chat Analyzer</h1>
                    <Navigation />
                </div>

                {/* Stream Info Bar */}
                <StreamInfoBar />

                {/* Time Filter Section */}
                <div className="glass-card p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 w-full sm:w-auto">時間範圍:</label>
                        <button
                            onClick={() => setStartDate(formatLocalHour(new Date(Date.now() - 12 * 60 * 60 * 1000)))}
                            className="bg-gray-200 hover:bg-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm text-gray-700 font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            -12H
                        </button>
                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1 sm:flex-none min-w-0"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            placeholder="開始時間"
                        />
                        <span className="text-gray-500 font-medium text-sm">→</span>
                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1 sm:flex-none min-w-0"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            max={formatLocalHour(new Date())}
                            placeholder="結束時間"
                        />
                        <button
                            onClick={() => setEndDate(formatLocalHour(new Date()))}
                            className="bg-gray-200 hover:bg-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm text-gray-700 font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            現在
                        </button>
                        <button
                            onClick={handleFilter}
                            className="flex items-center gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-6 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <MagnifyingGlassIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">篩選</span>
                        </button>
                        {(startDate || endDate) && (
                            <button
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setToggleRefresh(true);
                                    // Reset window immediately
                                    const now = new Date();
                                    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
                                    setTimeAxisConfig({
                                        type: 'time',
                                        time: { unit: 'hour', displayFormats: { hour: 'MM/dd HH:mm' } },
                                        min: twelveHoursAgo.getTime(),
                                        max: now.getTime(),
                                    });
                                }}
                                className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm font-medium underline transition-colors cursor-pointer"
                            >
                                <XMarkIcon className="w-4 h-4" />
                                <span>清除</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="glass-card p-4 sm:p-6 rounded-2xl h-[60vh] sm:h-[70vh] md:h-[80vh] flex flex-col relative group">
                    {/* Digital Clock */}
                    <div className="absolute top-4 sm:top-6 left-1/2 transform -translate-x-1/2 z-10 transition-opacity duration-300 opacity-100 pointer-events-none">
                        <div className="bg-white/90 backdrop-blur-sm px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-gray-100">
                            <span className="font-mono text-xl sm:text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 tracking-wider">
                                {currentTime.toLocaleTimeString('en-GB')}
                            </span>
                        </div>
                    </div>

                    {/* Event Marker Button */}
                    <button
                        onClick={() => setShowMarkerModal(true)}
                        className="absolute top-4 sm:top-6 right-4 sm:right-6 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm hover:bg-white px-3 py-1.5 rounded-lg shadow-md border border-gray-200 text-xs sm:text-sm font-medium text-gray-700 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        title="事件標記"
                    >
                        <FlagIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">事件標記</span>
                        {eventMarkers.length > 0 && (
                            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                {eventMarkers.length}
                            </span>
                        )}
                    </button>

                    <div className="flex-1 w-full min-h-0 pt-12">
                        <Chart type='bar' options={chartOptions} data={chartData} plugins={[hourGridPlugin, eventMarkerPlugin]} />
                    </div>
                </div>

                {/* Event Marker Modal */}
                <EventMarkerModal
                    isOpen={showMarkerModal}
                    onClose={() => setShowMarkerModal(false)}
                    markers={eventMarkers}
                    setMarkers={setEventMarkers}
                    showLabels={showMarkerLabels}
                    opacity={markerOpacity}
                    setOpacity={setMarkerOpacity}
                    setShowLabels={setShowMarkerLabels}
                />

                {/* Money Statistics */}
                <MoneyStats
                    startTime={startDate ? new Date(startDate).toISOString() : null}
                    endTime={endDate ? (() => {
                        const d = new Date(endDate);
                        d.setMinutes(59, 59, 999);
                        return d.toISOString();
                    })() : null}
                    hasTimeFilter={!!endDate}
                />

                {/* Word Cloud */}
                <WordCloudPanel
                    startTime={startDate ? new Date(startDate).toISOString() : null}
                    endTime={endDate ? (() => {
                        const d = new Date(endDate);
                        d.setMinutes(59, 59, 999);
                        return d.toISOString();
                    })() : null}
                    hasTimeFilter={!!endDate}
                />

                {/* Emoji Stats */}
                <EmojiStatsPanel
                    startTime={startDate ? new Date(startDate).toISOString() : null}
                    endTime={endDate ? (() => {
                        const d = new Date(endDate);
                        d.setMinutes(59, 59, 999);
                        return d.toISOString();
                    })() : null}
                    hasTimeFilter={!!endDate}
                />

                {/* Message List */}
                <MessageList
                    startTime={startDate ? new Date(startDate).toISOString() : null}
                    endTime={endDate ? (() => {
                        const d = new Date(endDate);
                        d.setMinutes(59, 59, 999);
                        return d.toISOString();
                    })() : null}
                    hasTimeFilter={!!endDate}
                />
            </div>
        </div>
    );
}

export default Dashboard;
