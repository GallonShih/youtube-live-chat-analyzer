import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import AuthorDetailContent from './AuthorDetailContent';
import { server } from '../../test/msw/server';

vi.mock('react-chartjs-2', () => ({
    Line: () => <div data-testid="line-chart" />,
}));

vi.mock('chart.js', () => ({
    Chart: { register: vi.fn() },
    CategoryScale: {},
    LinearScale: {},
    TimeScale: {},
    PointElement: {},
    LineElement: {},
    Title: {},
    Tooltip: {},
    Legend: {},
}));

describe('AuthorDetailContent', () => {
    test('renders author profile with avatar and badge', async () => {
        render(<AuthorDetailContent authorId="author_1" />);

        await screen.findByText('@AuthorOne');

        expect(screen.getByText(/author_id: author_1/i)).toBeInTheDocument();
        expect(screen.getByAltText('@AuthorOne')).toBeInTheDocument();
        expect(screen.getByTitle('Member (6 months)')).toBeInTheDocument();
    });

    test('renders emoji image and paid amount in messages tab', async () => {
        const user = userEvent.setup();
        render(<AuthorDetailContent authorId="author_1" />);

        await screen.findByText('@AuthorOne');
        await user.click(screen.getByRole('button', { name: 'Messages' }));

        await screen.findByText('$100.00');
        expect(screen.getByAltText(':smile:')).toBeInTheDocument();
    });

    test('shows backend detail for 404 summary response', async () => {
        server.use(
            http.get('http://localhost:8000/api/chat/authors/:authorId/summary', ({ params }) => {
                return HttpResponse.json(
                    {
                        detail: `查無作者資料：${params.authorId}。可能不在目前直播或時間範圍內。查詢範圍：live_stream_id=all, time_range=last_12_hours`,
                    },
                    { status: 404 }
                );
            })
        );

        render(<AuthorDetailContent authorId="missing_author" />);

        expect(await screen.findByText(/可能不在目前直播或時間範圍內/)).toBeInTheDocument();
    });

    test('supports messages pagination', async () => {
        const user = userEvent.setup();
        render(<AuthorDetailContent authorId="author_1" />);

        await screen.findByText('@AuthorOne');
        await user.click(screen.getByRole('button', { name: 'Messages' }));
        await screen.findByText('$100.00');

        await user.click(screen.getByRole('button', { name: '下一頁' }));

        await waitFor(() => {
            expect(screen.getByText('page2 message')).toBeInTheDocument();
        });
    });
});
