import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { TrophyIcon } from '@heroicons/react/24/outline';

/**
 * Bar Chart Race Component
 *
 * Displays a ranked bar chart that animates smoothly when rankings change.
 * Uses CSS transitions for smooth position swapping animations.
 * Auto-resizes to fit container.
 *
 * @param {Array} words - Array of { word: string, size: number }
 * @param {number} barLimit - Maximum number of bars to display (default: 10)
 */
function BarChartRace({ words = [], barLimit = 10 }) {
    const containerRef = useRef(null);
    const [containerHeight, setContainerHeight] = useState(500);

    // ResizeObserver for dynamic sizing
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { height } = entry.contentRect;
                if (height > 0) {
                    setContainerHeight(Math.floor(height));
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Color palette - expanded with richer, more vibrant colors (synced with DynamicWordCloud)
    const colorPalette = useMemo(() => [
        '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
        '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#48B8D0',
        '#6E7074', '#546570', '#C23531', '#2F4554', '#61A0A8',
        '#D48265', '#749F83', '#CA8622', '#BDA29A', '#6E7074',
        '#C4CCD3', '#F9C74F', '#90BE6D', '#43AA8B', '#577590',
        '#F94144', '#F3722C', '#F8961E', '#F9844A', '#277DA1'
    ], []);

    // Color hashing function (same as DynamicWordCloud)
    const getWordColor = useCallback((word) => {
        let hash = 0;
        for (let i = 0; i < word.length; i++) {
            hash = word.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colorPalette[Math.abs(hash) % colorPalette.length];
    }, [colorPalette]);

    // Format number with locale string
    const formatNumber = (num) => Math.floor(num).toLocaleString();

    // Calculate nice tick values for axis
    const getNiceTicks = (max) => {
        if (max === 0) return [0];
        const roughRange = max / 4;
        const magnitude = Math.pow(10, Math.floor(Math.log10(roughRange)));
        const relativeValue = roughRange / magnitude;

        let step;
        if (relativeValue < 1.5) step = 1;
        else if (relativeValue < 3) step = 2;
        else if (relativeValue < 7) step = 5;
        else step = 10;

        const tickStep = step * magnitude;
        const ticks = [];
        for (let i = 0; i <= max + tickStep; i += tickStep) {
            ticks.push(i);
            if (i > max) break;
        }
        return ticks;
    };

    // Process and sort data
    const { sortedData, currentMax, ticks } = useMemo(() => {
        if (!words || words.length === 0) {
            return { sortedData: [], currentMax: 100, ticks: [0, 25, 50, 75, 100] };
        }

        // Sort by size descending and limit
        const sorted = [...words]
            .sort((a, b) => b.size - a.size)
            .slice(0, barLimit)
            .map((w, idx) => ({
                name: w.word,
                value: w.size,
                color: getWordColor(w.word),
                rank: idx
            }));

        // Calculate dynamic max value (leader value / 0.85 so leader occupies ~85% of axis)
        // Use this directly instead of rounding to nice ticks
        const adjustedMax = sorted.length > 0 ? Math.ceil(sorted[0].value / 0.85) : 100;
        const dynamicTicks = getNiceTicks(adjustedMax);

        return {
            sortedData: sorted,
            currentMax: adjustedMax,
            ticks: dynamicTicks
        };
    }, [words, barLimit, getWordColor]);

    // Dynamic layout constants based on container height
    const labelWidth = 100;
    const rightPadding = 16;
    const topBottomPadding = 48; // Reserve space for padding and axis labels
    const availableHeight = Math.max(containerHeight - topBottomPadding, 100);
    const barCount = Math.min(barLimit, sortedData.length) || 1;
    const barHeight = Math.max(Math.floor((availableHeight / barCount) * 0.7), 20);
    const barGap = Math.max(Math.floor((availableHeight / barCount) * 0.3), 4);
    const chartHeight = barCount * (barHeight + barGap);

    // Empty state
    if (!words || words.length === 0) {
        return (
            <div
                ref={containerRef}
                className="relative bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center h-full w-full"
            >
                <div className="text-gray-400 text-center">
                    <TrophyIcon className="w-16 h-16 mx-auto mb-2" />
                    <div>載入資料後顯示排行榜</div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="relative bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 p-4 h-full w-full">
            {/* Grid lines container */}
            <div
                className="absolute pointer-events-none"
                style={{
                    top: '16px',
                    bottom: '32px',
                    left: `${labelWidth + 16}px`,
                    right: `${rightPadding}px`
                }}
            >
                {ticks.map((tick) => (
                    <div
                        key={tick}
                        className="absolute h-full border-l border-slate-200/60 transition-all duration-300 ease-out"
                        style={{ left: `${(tick / currentMax) * 100}%` }}
                    >
                        <span className="absolute -bottom-6 left-0 -translate-x-1/2 text-[10px] font-medium text-slate-400 tabular-nums">
                            {tick}
                        </span>
                    </div>
                ))}
            </div>

            {/* Bar container */}
            <div className="relative z-10" style={{ height: `${chartHeight}px` }}>
                {sortedData.map((bar, index) => {
                    const widthPercentage = (bar.value / currentMax) * 100;

                    return (
                        <div
                            key={bar.name}
                            className="absolute left-0 right-0 flex items-center"
                            style={{
                                // Vertical position transition for smooth rank swapping
                                transition: 'transform 600ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                                transform: `translateY(${index * (barHeight + barGap)}px)`,
                                height: `${barHeight}px`
                            }}
                        >
                            {/* Rank and name */}
                            <div
                                className="flex items-center justify-end pr-3 gap-2 shrink-0"
                                style={{ width: `${labelWidth}px` }}
                            >
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${index === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                    #{index + 1}
                                </span>
                                <span className="font-bold text-slate-600 text-xs truncate max-w-[60px]" title={bar.name}>
                                    {bar.name}
                                </span>
                            </div>

                            {/* Bar area */}
                            <div className="flex-1 h-full" style={{ paddingRight: `${rightPadding}px` }}>
                                <div className="h-full relative w-full">
                                    {/* Bar body */}
                                    <div
                                        className="h-full rounded-r-lg shadow-sm flex items-center justify-end px-2 transition-all duration-300 ease-out"
                                        style={{
                                            width: `${Math.max(widthPercentage, 2)}%`,
                                            backgroundColor: bar.color,
                                        }}
                                    >
                                        <span className="text-[10px] font-black text-white drop-shadow-sm tabular-nums whitespace-nowrap">
                                            {formatNumber(bar.value)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default BarChartRace;
