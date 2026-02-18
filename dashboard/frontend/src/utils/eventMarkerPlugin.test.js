import { describe, expect, test, vi } from 'vitest';
import eventMarkerPlugin from './eventMarkerPlugin';

function createCtx() {
    return {
        font: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 0,
        textAlign: '',
        textBaseline: '',
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        fillRect: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        setLineDash: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn((text) => ({ width: text.length * 6 })),
    };
}

describe('eventMarkerPlugin', () => {
    test('draws marker bands and labels in afterDraw', () => {
        const ctx = createCtx();
        const chart = {
            ctx,
            chartArea: { left: 0, right: 300, top: 10, bottom: 210 },
            scales: {
                x: {
                    min: 1000,
                    max: 5000,
                    getPixelForValue: (v) => (v - 1000) / 20,
                },
            },
            options: {
                plugins: {
                    eventMarker: {
                        showLabels: true,
                        opacity: 20,
                        markers: [
                            {
                                id: 1,
                                startTime: new Date(2000).toISOString(),
                                endTime: new Date(4000).toISOString(),
                                label: 'Segment A',
                                color: '#ff0000',
                            },
                        ],
                    },
                },
            },
        };

        eventMarkerPlugin.afterDraw(chart);
        expect(ctx.fillRect).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalledWith('Segment A', expect.any(Number), expect.any(Number));
    });

    test('supports hover mode in afterEvent and clears hover on mouseout', () => {
        const chart = {
            _eventMarkerHoverX: null,
            draw: vi.fn(),
            chartArea: { left: 0, right: 300, top: 10, bottom: 210 },
            options: {
                plugins: {
                    eventMarker: {
                        showLabels: false,
                        markers: [{ id: 1 }],
                    },
                },
            },
        };

        eventMarkerPlugin.afterEvent(chart, {
            event: { type: 'mousemove', x: 100, y: 100 },
        });
        expect(chart._eventMarkerHoverX).toBe(100);
        expect(chart.draw).toHaveBeenCalled();

        eventMarkerPlugin.afterEvent(chart, {
            event: { type: 'mouseout', x: 0, y: 0 },
        });
        expect(chart._eventMarkerHoverX).toBeNull();
    });
});
