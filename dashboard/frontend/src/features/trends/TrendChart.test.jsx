import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import TrendChart from './TrendChart';

const lineMock = vi.fn(({ data }) => <div data-testid="line-chart">{data.datasets[0].data.length}</div>);

vi.mock('react-chartjs-2', () => ({
    Line: (props) => lineMock(props),
}));

describe('TrendChart', () => {
    beforeEach(() => {
        lineMock.mockClear();
    });

    test('applies minimal style axis rules', () => {
        render(
            <TrendChart
                name="Group A"
                color="#5470C6"
                data={[
                    { hour: '2026-02-18T00:00:00Z', count: 2 },
                    { hour: '2026-02-18T01:00:00Z', count: 5 },
                ]}
                startTime="2026-02-18T00:00:00Z"
                endTime="2026-02-18T03:00:00Z"
                minimalStyle={true}
                minimalYAxisTickSize={20}
            />,
        );

        const options = lineMock.mock.calls.at(-1)[0].options;
        expect(options.scales.x.ticks.display).toBe(false);
        expect(options.scales.y.title.display).toBe(false);
        expect(options.layout.padding.top).toBe(10);
        expect(options.scales.y.grace).toBe('12%');
        expect(options.scales.y.suggestedMax).toBeGreaterThan(5);
        const ticks = [{ value: 0 }, { value: 2 }, { value: 4 }, { value: 6 }];
        expect(options.scales.y.ticks.callback(4, 2, ticks)).toBe('');
        expect(options.scales.y.ticks.callback(6, 3, ticks)).toBe('6');
        expect(options.scales.y.ticks.font.size).toBe(20);
        expect(options.scales.y.ticks.font.weight).toBe('700');
    });

    test('formats y-axis tick labels using k for thousands', () => {
        render(
            <TrendChart
                name="Group A"
                color="#5470C6"
                data={[
                    { hour: '2026-02-18T00:00:00Z', count: 1028 },
                ]}
                startTime="2026-02-18T00:00:00Z"
                endTime="2026-02-18T01:00:00Z"
                minimalStyle={false}
            />,
        );

        const options = lineMock.mock.calls.at(-1)[0].options;
        const callback = options.scales.y.ticks.callback;
        expect(callback(999, 0, [])).toBe('999');
        expect(callback(1000, 0, [])).toBe('1k');
        expect(callback(1500, 0, [])).toBe('1.5k');
    });

    test('renders empty state when data is empty', () => {
        render(
            <TrendChart
                name="Group A"
                color="#5470C6"
                data={[]}
                startTime={null}
                endTime={null}
            />,
        );
        expect(screen.getByText('此時段無符合的留言資料')).toBeInTheDocument();
    });

    test('renders line chart and stats for data points', () => {
        render(
            <TrendChart
                name="Group A"
                color="#5470C6"
                data={[
                    { hour: '2026-02-18T00:00:00Z', count: 2 },
                    { hour: '2026-02-18T02:00:00Z', count: 5 },
                ]}
                startTime="2026-02-18T00:00:00Z"
                endTime="2026-02-18T03:00:00Z"
                lineWidth={3}
                showPoints={false}
                chartHeight={300}
            />,
        );

        // Filled range from 00 to 03 => 4 hourly points
        expect(screen.getByTestId('line-chart')).toHaveTextContent('4');
        expect(screen.getByText('Group A')).toBeInTheDocument();
        expect(screen.getByText(/總計:/)).toBeInTheDocument();
        expect(screen.getByText(/最高:/)).toBeInTheDocument();
        expect(screen.getByTestId('trend-chart-container')).toHaveStyle({ height: '300px' });
    });
});
