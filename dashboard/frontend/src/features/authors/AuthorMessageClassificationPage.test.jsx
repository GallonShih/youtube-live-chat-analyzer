import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import AuthorMessageClassificationPage from './AuthorMessageClassificationPage';
import * as chatApi from '../../api/chat';
import * as downloadUtils from '../../utils/downloadMessages';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div>nav</div>,
}));

describe('AuthorMessageClassificationPage', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('classifies author messages with chat context and supports labeled download', async () => {
        const user = userEvent.setup();
        const baseTs = new Date('2026-02-27T00:00:00Z').getTime();
        const messages = Array.from({ length: 120 }, (_, index) => ({
            id: `m-${index}`,
            time: new Date(baseTs + index * 60 * 1000).toISOString(),
            author: index === 60 || index === 90 ? '@AuthorOne' : `@User${index}`,
            author_id: index === 60 || index === 90 ? 'author_1' : `user_${index}`,
            message: `message-${index}`,
            message_type: 'text_message',
        }));

        vi.spyOn(chatApi, 'fetchAuthorSummary').mockResolvedValue({
            display_name: '@AuthorOne',
            total_messages: 2,
        });
        vi.spyOn(chatApi, 'fetchChatMessages').mockResolvedValue({
            total: messages.length,
            messages,
        });
        const mockDownloadJSON = vi.spyOn(downloadUtils, 'downloadAsJSON').mockImplementation(() => {});

        render(
            <MemoryRouter initialEntries={['/authors/author_1/classify?start_time=2026-02-27T00:00:00Z&end_time=2026-02-27T23:59:59Z']}>
                <Routes>
                    <Route path="/authors/:authorId/classify" element={<AuthorMessageClassificationPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText('@AuthorOne');
        await user.click(screen.getByRole('button', { name: '開始分類' }));

        await screen.findByText('正在分類第 1 / 2 則');
        expect(screen.getByText('message-10')).toBeInTheDocument();
        expect(screen.getByText('message-110')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '標籤 1' }));
        await screen.findByText('正在分類第 2 / 2 則');
        await user.click(screen.getByRole('button', { name: '標籤 2' }));
        await screen.findByText('分類總覽');
        expect(screen.getAllByText('1 則 (50.0%)')).toHaveLength(2);

        await user.click(screen.getByRole('button', { name: '下載分類 JSON' }));

        await waitFor(() => {
            expect(mockDownloadJSON).toHaveBeenCalledWith(
                [
                    expect.objectContaining({ id: 'm-60', classification_label: '標籤 1' }),
                    expect.objectContaining({ id: 'm-90', classification_label: '標籤 2' }),
                ],
                expect.stringContaining('message_classification_'),
            );
        });
    });

    test('starts labeling before all chat message batches are returned', async () => {
        const user = userEvent.setup();
        vi.spyOn(chatApi, 'fetchAuthorSummary').mockResolvedValue({
            display_name: '@AuthorOne',
            total_messages: 2,
        });

        let resolveSecondBatch;
        const secondBatchPromise = new Promise((resolve) => {
            resolveSecondBatch = resolve;
        });

        const firstBatch = [
            {
                id: 'm-1',
                time: '2026-02-27T10:00:00Z',
                author: '@AuthorOne',
                author_id: 'author_1',
                message: 'first-target :smile:',
                emotes: [{ name: ':smile:', images: [{ url: 'https://example.com/smile.png' }] }],
                message_type: 'text_message'
            },
            { id: 'm-2', time: '2026-02-27T10:00:02Z', author: '@User2', author_id: 'user_2', message: 'u2', message_type: 'text_message' },
        ];
        const secondBatch = [
            { id: 'm-3', time: '2026-02-27T10:00:05Z', author: '@AuthorOne', author_id: 'author_1', message: 'second-target', message_type: 'text_message' },
        ];

        vi.spyOn(chatApi, 'fetchChatMessages')
            .mockResolvedValueOnce({ total: 501, messages: firstBatch })
            .mockImplementationOnce(() => secondBatchPromise)
            .mockResolvedValueOnce({ total: 501, messages: [] });

        render(
            <MemoryRouter initialEntries={['/authors/author_1/classify']}>
                <Routes>
                    <Route path="/authors/:authorId/classify" element={<AuthorMessageClassificationPage />} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText('@AuthorOne');
        await user.click(screen.getByRole('button', { name: '開始分類' }));

        await screen.findByText('正在分類第 1 / 2 則');
        expect(screen.getByText(/載入聊天室訊息中/)).toBeInTheDocument();
        expect(screen.getAllByAltText(':smile:').length).toBeGreaterThan(0);

        resolveSecondBatch({ total: 501, messages: secondBatch });

        await screen.findByText('正在分類第 1 / 2 則');
    });
});
