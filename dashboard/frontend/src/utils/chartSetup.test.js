import { beforeEach, describe, expect, test, vi } from 'vitest';

const chartMocks = vi.hoisted(() => {
    const registerSpy = vi.fn();
    return {
        registerSpy,
        Chart: { register: registerSpy },
        CategoryScale: Symbol('CategoryScale'),
        LinearScale: Symbol('LinearScale'),
        TimeScale: Symbol('TimeScale'),
        PointElement: Symbol('PointElement'),
        LineElement: Symbol('LineElement'),
        BarElement: Symbol('BarElement'),
        Title: Symbol('Title'),
        Tooltip: Symbol('Tooltip'),
        Legend: Symbol('Legend'),
        Filler: Symbol('Filler'),
    };
});

vi.mock('chart.js', () => ({
    Chart: chartMocks.Chart,
    CategoryScale: chartMocks.CategoryScale,
    LinearScale: chartMocks.LinearScale,
    TimeScale: chartMocks.TimeScale,
    PointElement: chartMocks.PointElement,
    LineElement: chartMocks.LineElement,
    BarElement: chartMocks.BarElement,
    Title: chartMocks.Title,
    Tooltip: chartMocks.Tooltip,
    Legend: chartMocks.Legend,
    Filler: chartMocks.Filler,
}));
vi.mock('chartjs-adapter-date-fns', () => ({}));

import { registerChartComponents, hourGridPlugin } from './chartSetup';

describe('chartSetup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('registerChartComponents registers all required chart.js modules', () => {
        registerChartComponents();
        expect(chartMocks.registerSpy).toHaveBeenCalledTimes(1);
        expect(chartMocks.registerSpy).toHaveBeenCalledWith(
            chartMocks.CategoryScale,
            chartMocks.LinearScale,
            chartMocks.TimeScale,
            chartMocks.PointElement,
            chartMocks.LineElement,
            chartMocks.BarElement,
            chartMocks.Title,
            chartMocks.Tooltip,
            chartMocks.Legend,
            chartMocks.Filler,
        );
    });

    test('hourGridPlugin draws hourly vertical lines and safely handles missing axis', () => {
        const ctx = {
            save: vi.fn(),
            beginPath: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
            stroke: vi.fn(),
            restore: vi.fn(),
        };

        const min = new Date('2026-02-18T10:30:00Z').getTime();
        const max = new Date('2026-02-18T12:00:00Z').getTime();
        const chart = {
            ctx,
            scales: {
                x: {
                    min,
                    max,
                    left: 0,
                    right: 1000,
                    top: 10,
                    bottom: 210,
                    getPixelForValue: (v) => (v - min) / 10000,
                },
            },
        };

        hourGridPlugin.beforeDraw(chart);
        expect(ctx.moveTo).toHaveBeenCalled();
        expect(ctx.lineTo).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();

        hourGridPlugin.beforeDraw({ ctx, scales: {} });
        expect(ctx.save).toHaveBeenCalled();
    });
});
