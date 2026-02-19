import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import AuthorDetailContent from './AuthorDetailContent';
import { server } from '../../test/msw/server';
import * as downloadUtils from '../../utils/downloadMessages';

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

    test('download button is disabled before summary loads', () => {
        render(<AuthorDetailContent authorId="author_1" />);

        const downloadBtn = screen.getByRole('button', { name: /下載/ });
        expect(downloadBtn).toBeDisabled();
    });

    test('download button becomes enabled after summary loads', async () => {
        render(<AuthorDetailContent authorId="author_1" />);

        await screen.findByText('@AuthorOne');

        const downloadBtn = screen.getByRole('button', { name: /下載/ });
        expect(downloadBtn).toBeEnabled();
    });

    test('opens download menu and triggers CSV download', async () => {
        const user = userEvent.setup();
        const mockFetchAll = vi.spyOn(downloadUtils, 'fetchAllMessages').mockResolvedValue([
            { id: 'm1', message: 'hello', author: '@AuthorOne', author_id: 'author_1' },
        ]);
        const mockCSV = vi.spyOn(downloadUtils, 'downloadAsCSV').mockImplementation(() => {});

        render(<AuthorDetailContent authorId="author_1" />);
        await screen.findByText('@AuthorOne');

        await user.click(screen.getByRole('button', { name: /下載/ }));
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'JSON' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'CSV' }));

        await waitFor(() => {
            expect(mockFetchAll).toHaveBeenCalledWith('author_1', expect.any(String), expect.any(String));
        });
        expect(mockCSV).toHaveBeenCalledWith(
            [{ id: 'm1', message: 'hello', author: '@AuthorOne', author_id: 'author_1' }],
            expect.stringContaining('.csv'),
        );

        mockFetchAll.mockRestore();
        mockCSV.mockRestore();
    });

    test('opens download menu and triggers JSON download', async () => {
        const user = userEvent.setup();
        const mockFetchAll = vi.spyOn(downloadUtils, 'fetchAllMessages').mockResolvedValue([
            { id: 'm1', message: 'hello' },
        ]);
        const mockJSON = vi.spyOn(downloadUtils, 'downloadAsJSON').mockImplementation(() => {});

        render(<AuthorDetailContent authorId="author_1" />);
        await screen.findByText('@AuthorOne');

        await user.click(screen.getByRole('button', { name: /下載/ }));
        await user.click(screen.getByRole('button', { name: 'JSON' }));

        await waitFor(() => {
            expect(mockJSON).toHaveBeenCalledWith(
                [{ id: 'm1', message: 'hello' }],
                expect.stringContaining('.json'),
            );
        });

        mockFetchAll.mockRestore();
        mockJSON.mockRestore();
    });

    test('shows loading text during download and restores after', async () => {
        const user = userEvent.setup();
        let resolveFetch;
        const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
        const mockFetchAll = vi.spyOn(downloadUtils, 'fetchAllMessages').mockReturnValue(fetchPromise);
        const mockCSV = vi.spyOn(downloadUtils, 'downloadAsCSV').mockImplementation(() => {});

        render(<AuthorDetailContent authorId="author_1" />);
        await screen.findByText('@AuthorOne');

        await user.click(screen.getByRole('button', { name: /下載/ }));
        await user.click(screen.getByRole('button', { name: 'CSV' }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /下載中/ })).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /下載中/ })).toBeDisabled();

        resolveFetch([]);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /下載/ })).toBeEnabled();
            expect(screen.queryByText(/下載中/)).not.toBeInTheDocument();
        });

        mockFetchAll.mockRestore();
        mockCSV.mockRestore();
    });

    test('closes download menu when clicking outside', async () => {
        const user = userEvent.setup();
        render(<AuthorDetailContent authorId="author_1" />);
        await screen.findByText('@AuthorOne');

        await user.click(screen.getByRole('button', { name: /下載/ }));
        expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();

        // Click outside the menu
        await user.click(document.body);

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
        });
    });
});
