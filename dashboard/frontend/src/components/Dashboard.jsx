import React, { useState, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { enUS } from 'date-fns/locale';
import MessageList from './MessageList';
import { Link } from 'react-router-dom';

ChartJS.register(
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const API_BASE_URL = 'http://localhost:8000'; // Should be configurable or relative in prod

function Dashboard() {
    const [viewData, setViewData] = useState([]);
    const [commentData, setCommentData] = useState([]);
    const [barFlash, setBarFlash] = useState(false);

    // Filter States
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [toggleRefresh, setToggleRefresh] = useState(true);

    // Dynamic Time Axis State
    const [timeAxisConfig, setTimeAxisConfig] = useState({
        type: 'time',
        time: {
            unit: 'hour',
            displayFormats: { hour: 'MM/dd HH:mm' }
        },
        ticks: {
            source: 'auto', // Ensure ticks are generated based on scale, not just data
            autoSkip: false // Try to show all hour ticks if space permits
        },
        min: new Date(new Date().getTime() - 12 * 60 * 60 * 1000).getTime(), // Initial rolling 12h
        max: new Date().getTime(),
    });

    const fetchViewers = async (start, end) => {
        try {
            let url = `${API_BASE_URL}/api/stats/viewers?hours=12`;
            if (start && end) {
                url = `${API_BASE_URL}/api/stats/viewers?start_time=${start}&end_time=${end}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            const validData = data.map(d => ({
                // API returns UTC ISO string without Z
                x: new Date(d.time.endsWith('Z') ? d.time : d.time + 'Z').getTime(),
                y: d.count
            }));
            setViewData(validData);
        } catch (err) {
            console.error("Failed to fetch viewers", err);
        }
    };

    const fetchComments = async (start, end) => {
        try {
            let url = `${API_BASE_URL}/api/stats/comments?hours=12`;
            if (start && end) {
                url = `${API_BASE_URL}/api/stats/comments?start_time=${start}&end_time=${end}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            const validData = data.map(d => ({
                // API returns UTC ISO string without Z
                // Shift by +30 minutes to center the bar in the hour slot
                x: new Date(d.hour.endsWith('Z') ? d.hour : d.hour + 'Z').getTime() + 30 * 60 * 1000,
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
            alert('Please select start time');
            return;
        }

        const startIso = new Date(startDate).toISOString();

        // If no endDate, use current time (+8 timezone)
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
        // Initial / Polling
        const intervalId = setInterval(() => {
            if (toggleRefresh) {
                fetchViewers();
                fetchComments();

                // Update rolling window
                const now = new Date();
                const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
                setTimeAxisConfig(prev => ({
                    ...prev,
                    min: twelveHoursAgo.getTime(),
                    max: now.getTime(),
                }));
            }
        }, 5000);

        // Ensure initial run
        if (toggleRefresh) {
            fetchViewers();
            fetchComments();
        }

        return () => clearInterval(intervalId);
    }, [toggleRefresh]);



    // Dual Axis Chart Config
    const chartData = {
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
                    // Only show red dot on last point if no time filter is set
                    return (index === count - 1 && !endDate) ? 5 : 0;
                },
                pointBackgroundColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    // Only red color on last point if no time filter
                    return (index === count - 1 && !endDate) ? '#ff4d4f' : '#5470C6';
                },
                pointBorderColor: (ctx) => {
                    const index = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    // Only red color on last point if no time filter
                    return (index === count - 1 && !endDate) ? '#ff4d4f' : '#5470C6';
                },
                pointHoverRadius: 8,
                yAxisID: 'y1',
                order: 1, // Draw on top
            },
            {
                type: 'bar',
                label: '每小時留言數',
                data: commentData,
                backgroundColor: (ctx) => {
                    if (!commentData.length || !ctx.raw) return '#91cc75'; // Default color green-ish for distinction

                    // Only highlight last bar if no time filter is set
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
    };

    // Custom Plugin to draw Grid Lines strictly at Top of Hour
    const hourGridPlugin = {
        id: 'hourGrid',
        beforeDraw: (chart) => {
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y1; // Use y1 height reference

            // Save context
            ctx.save();
            ctx.beginPath();
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#e0e0e0'; // Grid color

            const minTime = xAxis.min;
            const maxTime = xAxis.max;

            // Find first top of hour after minTime
            let currentTime = new Date(minTime);
            if (currentTime.getMinutes() !== 0 || currentTime.getSeconds() !== 0 || currentTime.getMilliseconds() !== 0) {
                // Move to next hour
                currentTime.setHours(currentTime.getHours() + 1, 0, 0, 0);
            }

            while (currentTime.getTime() <= maxTime) {
                const x = xAxis.getPixelForValue(currentTime.getTime());

                // Draw vertical line if within chart area
                if (x >= xAxis.left && x <= xAxis.right) {
                    ctx.moveTo(x, xAxis.top);
                    ctx.lineTo(x, xAxis.bottom);
                }

                // Increment 1 hour
                currentTime.setTime(currentTime.getTime() + 60 * 60 * 1000);
            }

            ctx.stroke();
            ctx.restore();
        }
    };

    // Register the plugin only for this chart or use in options
    // ChartJS 3/4 way is to pass in plugins array or register globally.
    // We will include it in the <Chart /> component usage below.

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false,

        },
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Real-time Analytics' },
            tooltip: {
                enabled: false, // Disable default canvas tooltip
                external: (context) => {
                    const { chart, tooltip } = context;
                    let tooltipEl = document.getElementById('chartjs-tooltip');

                    // Create element on first render
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
                        tooltipEl.style.zIndex = '100'; // Ensure on top
                        document.body.appendChild(tooltipEl);
                    }

                    // Hide if no tooltip
                    if (tooltip.opacity === 0) {
                        tooltipEl.style.opacity = 0;
                        return;
                    }

                    // Set View/Logic
                    if (tooltip.body) {
                        const item = tooltip.dataPoints[0];
                        const timestamp = item.raw.x;
                        const dateObj = new Date(timestamp);

                        // Formatting Time
                        const pad = n => n.toString().padStart(2, '0');
                        const timeStr = `${pad(dateObj.getMonth() + 1)}/${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;

                        // --- Logic for finding both values ---

                        // 1. Comments
                        // Floor to hour, then + 30 mins
                        const cDate = new Date(timestamp);
                        cDate.setMinutes(0, 0, 0);
                        const cKey = cDate.getTime() + 30 * 60 * 1000;
                        const cData = commentData.find(d => d.x === cKey);
                        const cVal = cData ? cData.y : 'NA';

                        // 2. Viewers
                        let vVal = 'NA';
                        if (viewData.length > 0) {
                            const closestViewer = viewData.reduce((prev, curr) => {
                                return (Math.abs(curr.x - timestamp) < Math.abs(prev.x - timestamp) ? curr : prev);
                            });
                            // Strict 5 minute threshold
                            const diff = Math.abs(closestViewer.x - timestamp);
                            if (diff <= 5 * 60 * 1000) {
                                vVal = closestViewer.y;
                            }
                        }

                        // HTML Generation
                        // Viewers Row (Line Color: #5470C6)
                        const vRow = `
                            <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                <span style="display:inline-block; width:10px; height:10px; background-color:#5470C6; margin-right:6px;"></span>
                                <span>Viewers: ${vVal}</span>
                            </div>`;

                        // Comments Row (Bar Color: #91cc75 or #ff4d4f)
                        const cHour = cDate.getHours();
                        const cRange = `${pad(cHour)}:00 - ${pad(cHour)}:59`;
                        const cRow = `
                            <div style="display: flex; align-items: center;">
                                <span style="display:inline-block; width:10px; height:10px; background-color:#91cc75; margin-right:6px;"></span>
                                <span>Comments (${cRange}): ${cVal}</span>
                            </div>`;

                        tooltipEl.innerHTML = `<div style="font-weight:bold; margin-bottom:6px;">${timeStr}</div>${vRow}${cRow}`;
                    }

                    // Positioning
                    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
                    tooltipEl.style.opacity = 1;
                    tooltipEl.style.left = positionX + tooltip.caretX + 'px';
                    tooltipEl.style.top = positionY + tooltip.caretY + 'px';
                }
            },
        },
        scales: {
            x: {
                ...timeAxisConfig,
                grid: { display: false }, // Disable default grid, use plugin
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
                grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
                beginAtZero: true,
            },
        },
    };

    // Helper for local datetime-local string (YYYY-MM-DDTHH:00)
    const formatLocalHour = (date) => {
        const d = new Date(date);
        d.setMinutes(0, 0, 0);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
    };

    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {/* Header with Title and Navigation */}
                <div className="flex flex-col md:flex-row justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-gray-800 mb-4 md:mb-0">Hermes 監控儀表板</h1>

                    <div className="flex gap-3">
                        <Link
                            to="/"
                            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all duration-200 hover:shadow-lg"
                        >
                            📊 Dashboard
                        </Link>
                        <Link
                            to="/admin"
                            className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 transition-all duration-200 hover:shadow-lg"
                        >
                            ⚙️ Admin Panel
                        </Link>
                    </div>
                </div>

                {/* Time Filter Section */}
                <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="text-sm font-semibold text-gray-700">時間範圍:</label>
                        <button
                            onClick={() => setStartDate(formatLocalHour(new Date(Date.now() - 12 * 60 * 60 * 1000)))}
                            className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-md text-sm text-gray-700 font-medium transition-colors"
                        >
                            -12H
                        </button>
                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            placeholder="開始時間"
                        />
                        <span className="text-gray-500 font-medium">→</span>
                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            max={formatLocalHour(new Date())}
                            placeholder="結束時間"
                        />
                        <button
                            onClick={() => setEndDate(formatLocalHour(new Date()))}
                            className="bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-md text-sm text-gray-700 font-medium transition-colors"
                        >
                            現在
                        </button>
                        <button
                            onClick={handleFilter}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg"
                        >
                            🔍 篩選
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
                                className="text-red-600 hover:text-red-700 text-sm font-medium underline transition-colors"
                            >
                                ✕ 清除
                            </button>
                        )}
                    </div>
                </div>


                <div className="bg-white p-6 rounded-lg shadow-md h-[80vh]">
                    <Chart type='bar' options={chartOptions} data={chartData} plugins={[hourGridPlugin]} />
                </div>

                {/* Message List */}
                <MessageList
                    startTime={startDate ? new Date(startDate).toISOString() : null}
                    endTime={(() => {
                        const d = endDate ? new Date(endDate) : new Date();
                        d.setMinutes(59, 59, 999);
                        return d.toISOString();
                    })()}
                    hasTimeFilter={!!endDate}
                />
            </div >
        </div >
    );
}

export default Dashboard;
