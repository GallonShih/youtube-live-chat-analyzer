import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import TrendChart from './TrendChart';

vi.mock('react-chartjs-2', () => ({
    Line: ({ data }) => <div data-testid="line-chart">{data.datasets[0].data.length}</div>,
}));

describe('TrendChart', () => {
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
            />,
        );

        // Filled range from 00 to 03 => 4 hourly points
        expect(screen.getByTestId('line-chart')).toHaveTextContent('4');
        expect(screen.getByText('Group A')).toBeInTheDocument();
        expect(screen.getByText(/總計:/)).toBeInTheDocument();
        expect(screen.getByText(/最高:/)).toBeInTheDocument();
    });
});

