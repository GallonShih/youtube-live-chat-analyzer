import { renderHook, act } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { useChartAxisMode, CHART_MODES } from './useChartAxisMode';

// Helper to create mock snapshots
function makeSnapshots(count, startMs = 1000000, stepMs = 300000) {
    return Array.from({ length: count }, (_, i) => ({
        timestamp: new Date(startMs + i * stepMs).toISOString(),
        viewer_count: 100 + i * 10,
        hourly_messages: 50 + i * 5,
    }));
}

describe('useChartAxisMode', () => {
    test('defaults to overview mode', () => {
        const { result } = renderHook(() => useChartAxisMode());
        expect(result.current.chartMode).toBe(CHART_MODES.OVERVIEW);
        expect(result.current.rollingWindowHours).toBe(4);
        expect(result.current.dynamicYAxis).toBe(true);
        expect(result.current.shouldShowPositionLine).toBe(true);
    });

    describe('getTimeRange', () => {
        test('returns undefined for empty snapshots', () => {
            const { result } = renderHook(() => useChartAxisMode());
            const range = result.current.getTimeRange([], null, 300);
            expect(range.min).toBeUndefined();
            expect(range.max).toBeUndefined();
        });

        test('overview mode returns full range', () => {
            const { result } = renderHook(() => useChartAxisMode());
            const snapshots = makeSnapshots(10);
            const range = result.current.getTimeRange(snapshots, snapshots[4], 300);
            expect(range.min).toBe(new Date(snapshots[0].timestamp).getTime());
            expect(range.max).toBe(new Date(snapshots[9].timestamp).getTime());
        });

        test('growing mode: min=start, max=current+1step', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => result.current.setChartMode(CHART_MODES.GROWING));

            const snapshots = makeSnapshots(10);
            const current = snapshots[4];
            const range = result.current.getTimeRange(snapshots, current, 300);
            const currentTime = new Date(current.timestamp).getTime();

            expect(range.min).toBe(new Date(snapshots[0].timestamp).getTime());
            expect(range.max).toBe(currentTime + 300 * 1000);
        });

        test('supports mode override for all-mode rendering', () => {
            const { result } = renderHook(() => useChartAxisMode());
            const snapshots = makeSnapshots(100, Date.now(), 300000);
            const current = snapshots[50];

            const range = result.current.getTimeRange(
                snapshots,
                current,
                300,
                CHART_MODES.ROLLING,
                2
            );
            const currentTime = new Date(current.timestamp).getTime();

            expect(range.min).toBe(currentTime - 2 * 60 * 60 * 1000);
            expect(range.max).toBe(currentTime + 300 * 1000);
        });

        test('rolling mode: min=current-window, max=current+1step', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.ROLLING);
                result.current.setRollingWindowHours(2);
            });

            const startMs = Date.now();
            const snapshots = makeSnapshots(100, startMs, 300000); // 100 snapshots, 5min each
            const current = snapshots[50]; // ~4h10m in
            const range = result.current.getTimeRange(snapshots, current, 300);
            const currentTime = new Date(current.timestamp).getTime();
            const windowMs = 2 * 60 * 60 * 1000;

            expect(range.min).toBe(currentTime - windowMs);
            expect(range.max).toBe(currentTime + 300 * 1000);
        });

        test('rolling mode: min does not go below allMin', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.ROLLING);
                result.current.setRollingWindowHours(4);
            });

            const snapshots = makeSnapshots(5); // only 25min of data
            const current = snapshots[2];
            const range = result.current.getTimeRange(snapshots, current, 300);

            expect(range.min).toBe(new Date(snapshots[0].timestamp).getTime());
        });
    });

    describe('getMaxValues', () => {
        test('overview mode returns global max', () => {
            const { result } = renderHook(() => useChartAxisMode());
            const snapshots = makeSnapshots(10);
            const visible = snapshots.slice(0, 5);
            const { maxViewerCount, maxMessageCount } = result.current.getMaxValues(snapshots, visible, visible[4]);

            expect(maxViewerCount).toBe(190); // 100 + 9*10
            expect(maxMessageCount).toBe(95); // 50 + 9*5
        });

        test('rolling mode with dynamicYAxis returns window max', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.ROLLING);
                result.current.setRollingWindowHours(1);
                result.current.setDynamicYAxis(true);
            });

            // 5-min steps, 20 snapshots = 100 min
            const startMs = Date.now();
            const snapshots = makeSnapshots(20, startMs, 300000);
            const visible = snapshots.slice(0, 15); // up to index 14
            const current = visible[14];
            const { maxViewerCount, maxMessageCount } = result.current.getMaxValues(snapshots, visible, current);

            // Window is 1 hour = 12 steps back from index 14 => index 2..14
            // viewer: max at index 14 = 100 + 14*10 = 240
            // Should be less than global max (100 + 19*10 = 290)
            expect(maxViewerCount).toBeLessThanOrEqual(240);
            expect(maxViewerCount).toBeLessThan(290);
        });

        test('rolling mode with dynamicYAxis OFF returns global max', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.ROLLING);
                result.current.setDynamicYAxis(false);
            });

            const snapshots = makeSnapshots(10);
            const visible = snapshots.slice(0, 5);
            const { maxViewerCount } = result.current.getMaxValues(snapshots, visible, visible[4]);
            expect(maxViewerCount).toBe(190);
        });

        test('growing mode with dynamicYAxis returns visible max (not global)', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.GROWING);
                result.current.setDynamicYAxis(true);
            });

            const snapshots = makeSnapshots(20); // global max at index 19
            const visible = snapshots.slice(0, 5); // only first 5
            const current = visible[4];
            const { maxViewerCount } = result.current.getMaxValues(snapshots, visible, current);

            // visible max = 100 + 4*10 = 140, global max = 100 + 19*10 = 290
            expect(maxViewerCount).toBe(140);
            expect(maxViewerCount).toBeLessThan(290);
        });

        test('growing mode with dynamicYAxis OFF returns global max', () => {
            const { result } = renderHook(() => useChartAxisMode());
            act(() => {
                result.current.setChartMode(CHART_MODES.GROWING);
                result.current.setDynamicYAxis(false);
            });

            const snapshots = makeSnapshots(20);
            const visible = snapshots.slice(0, 5);
            const { maxViewerCount } = result.current.getMaxValues(snapshots, visible, visible[4]);
            expect(maxViewerCount).toBe(290);
        });
    });

    describe('shouldShowPositionLine', () => {
        test('true for overview and growing, false for rolling', () => {
            const { result } = renderHook(() => useChartAxisMode());
            expect(result.current.shouldShowPositionLine).toBe(true);

            act(() => result.current.setChartMode(CHART_MODES.GROWING));
            expect(result.current.shouldShowPositionLine).toBe(true);

            act(() => result.current.setChartMode(CHART_MODES.ROLLING));
            expect(result.current.shouldShowPositionLine).toBe(false);
        });
    });

    describe('chartAnimation', () => {
        test('false for overview/growing, has duration for rolling', () => {
            const { result } = renderHook(() => useChartAxisMode());
            expect(result.current.chartAnimation).toBe(false);

            act(() => result.current.setChartMode(CHART_MODES.GROWING));
            expect(result.current.chartAnimation).toBe(false);

            act(() => result.current.setChartMode(CHART_MODES.ROLLING));
            expect(result.current.chartAnimation).toEqual({ duration: 300 });
        });
    });
});
