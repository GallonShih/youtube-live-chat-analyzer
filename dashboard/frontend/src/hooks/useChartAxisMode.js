import { useState, useCallback } from 'react';

/** Chart X-axis display modes */
export const CHART_MODES = {
    OVERVIEW: 'overview',   // A: Fixed full range, data fills in progressively
    GROWING: 'growing',     // B: X-axis grows with data, no fixed max
    ROLLING: 'rolling',     // C: Fixed-width window follows current position
    ALL: 'all',             // A+B+C: Render all chart modes together
};

/** Rolling window size options (hours) */
export const ROLLING_WINDOW_OPTIONS = [
    { value: 1, label: '1 小時' },
    { value: 2, label: '2 小時' },
    { value: 4, label: '4 小時' },
    { value: 8, label: '8 小時' },
    { value: 12, label: '12 小時' },
];

/**
 * Custom hook for managing chart X-axis mode and related calculations.
 *
 * Manages:
 * - chartMode: 'overview' | 'growing' | 'rolling'
 * - rollingWindowHours: window size for rolling mode
 * - dynamicYAxis: whether Y-axis auto-scales in rolling mode
 *
 * Provides:
 * - getTimeRange(): computes X-axis { min, max }
 * - getMaxValues(): computes Y-axis suggestedMax for viewer & message counts
 * - shouldShowPositionLine: whether to render the red current-position line
 */
export function useChartAxisMode() {
    const [chartMode, setChartMode] = useState(CHART_MODES.OVERVIEW);
    const [rollingWindowHours, setRollingWindowHours] = useState(4);
    const [dynamicYAxis, setDynamicYAxis] = useState(true);

    /**
     * Compute X-axis time range based on current mode.
     *
     * @param {Array} snapshots - All loaded snapshots
     * @param {Object|null} currentSnapshot - The snapshot at currentIndex
     * @param {number} stepSeconds - Step interval in seconds
     * @param {string=} modeOverride - Optional mode override
     * @param {number=} rollingWindowHoursOverride - Optional rolling window override
     * @returns {{ min: number|undefined, max: number|undefined }}
     */
    const getTimeRange = useCallback((snapshots, currentSnapshot, stepSeconds, modeOverride, rollingWindowHoursOverride) => {
        if (!snapshots.length) return { min: undefined, max: undefined };

        const mode = modeOverride || chartMode;
        const rollingHours = rollingWindowHoursOverride ?? rollingWindowHours;
        const allMin = new Date(snapshots[0].timestamp).getTime();
        const allMax = new Date(snapshots[snapshots.length - 1].timestamp).getTime();

        if (mode === CHART_MODES.OVERVIEW) {
            return { min: allMin, max: allMax };
        }

        const currentTime = currentSnapshot
            ? new Date(currentSnapshot.timestamp).getTime()
            : allMin;
        // Right padding: 1 step worth of time
        const rightPadding = stepSeconds * 1000;

        if (mode === CHART_MODES.GROWING) {
            return {
                min: allMin,
                max: currentTime + rightPadding,
            };
        }

        // ROLLING mode
        const windowMs = rollingHours * 60 * 60 * 1000;
        return {
            min: Math.max(allMin, currentTime - windowMs),
            max: currentTime + rightPadding,
        };
    }, [chartMode, rollingWindowHours]);

    /**
     * Compute Y-axis max values based on mode.
     *
     * Overview: always use global max from all snapshots (stable Y-axis).
     * Growing with dynamicYAxis: use max from visibleSnapshots only.
     * Rolling with dynamicYAxis: use max within the rolling window only.
     * Growing/Rolling without dynamicYAxis: use global max.
     *
     * @param {Array} snapshots - All loaded snapshots
     * @param {Array} visibleSnapshots - Snapshots up to currentIndex
     * @param {Object|null} currentSnapshot - Current snapshot
     * @param {string=} modeOverride - Optional mode override
     * @param {number=} rollingWindowHoursOverride - Optional rolling window override
     * @param {boolean=} dynamicYAxisOverride - Optional dynamic Y-axis override
     * @returns {{ maxViewerCount: number, maxMessageCount: number }}
     */
    const getMaxValues = useCallback((
        snapshots,
        visibleSnapshots,
        currentSnapshot,
        modeOverride,
        rollingWindowHoursOverride,
        dynamicYAxisOverride
    ) => {
        if (!snapshots.length) return { maxViewerCount: 0, maxMessageCount: 0 };

        const mode = modeOverride || chartMode;
        const rollingHours = rollingWindowHoursOverride ?? rollingWindowHours;
        const dynamic = dynamicYAxisOverride ?? dynamicYAxis;

        // Global max (used by overview, and non-dynamic modes)
        const globalMaxV = Math.max(...snapshots.map(s => s.viewer_count || 0));
        const globalMaxM = Math.max(...snapshots.map(s => s.hourly_messages || 0));

        // Overview always uses global max
        if (mode === CHART_MODES.OVERVIEW || !dynamic) {
            return { maxViewerCount: globalMaxV, maxMessageCount: globalMaxM };
        }

        if (!currentSnapshot) {
            return { maxViewerCount: globalMaxV, maxMessageCount: globalMaxM };
        }

        // Determine which snapshots to use for dynamic Y-axis
        let relevantSnaps;
        if (mode === CHART_MODES.GROWING) {
            // Growing: use all visible snapshots (everything up to currentIndex)
            relevantSnaps = visibleSnapshots;
        } else {
            // Rolling: use only snapshots within the rolling window
            const windowMs = rollingHours * 60 * 60 * 1000;
            const currentTime = new Date(currentSnapshot.timestamp).getTime();
            const windowMin = currentTime - windowMs;
            relevantSnaps = visibleSnapshots.filter(s =>
                new Date(s.timestamp).getTime() >= windowMin
            );
        }

        if (!relevantSnaps.length) {
            return { maxViewerCount: globalMaxV, maxMessageCount: globalMaxM };
        }

        const maxV = Math.max(...relevantSnaps.map(s => s.viewer_count || 0));
        const maxM = Math.max(...relevantSnaps.map(s => s.hourly_messages || 0));

        // Ensure a minimum so chart doesn't collapse to zero
        return {
            maxViewerCount: Math.max(maxV, 1),
            maxMessageCount: Math.max(maxM, 1),
        };
    }, [chartMode, rollingWindowHours, dynamicYAxis]);

    /**
     * Whether to show the red dashed current-position vertical line.
     * - Overview & Growing: yes (line shows progress within the chart)
     * - Rolling: no (current position is always at the right edge)
     */
    const shouldShowPositionLine = chartMode !== CHART_MODES.ROLLING;

    /**
     * Chart animation setting based on mode.
     * Rolling mode benefits from a short animation for smooth sliding.
     */
    const chartAnimation = chartMode === CHART_MODES.ROLLING
        ? { duration: 300 }
        : false;

    return {
        chartMode,
        setChartMode,
        rollingWindowHours,
        setRollingWindowHours,
        dynamicYAxis,
        setDynamicYAxis,
        getTimeRange,
        getMaxValues,
        shouldShowPositionLine,
        chartAnimation,
    };
}

export default useChartAxisMode;
