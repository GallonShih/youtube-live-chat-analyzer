import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import EmojiStatsPanel from './EmojiStatsPanel';
import { useEmojiStats } from '../../hooks/useEmojiStats';

vi.mock('../../hooks/useEmojiStats', () => ({
    useEmojiStats: vi.fn(),
}));

vi.mock('../../components/common/Skeleton', () => ({
    SkeletonTable: () => <div data-testid="emoji-skeleton" />,
}));

vi.mock('../../components/common/Spinner', () => ({
    default: ({ size }) => <div data-testid={`spinner-${size}`} />,
}));

describe('EmojiStatsPanel', () => {
    const getEmojis = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useEmojiStats.mockReturnValue({
            emojis: [
                {
                    name: ':yt-emoji:',
                    is_youtube_emoji: true,
                    image_url: 'https://example.com/yt.png',
                    message_count: 123,
                },
                {
                    name: '😀',
                    is_youtube_emoji: false,
                    image_url: null,
                    message_count: 45,
                },
            ],
            loading: false,
            isRefreshing: false,
            error: null,
            total: 40,
            getEmojis,
        });
    });

    test('loads data and supports filter, refresh, pagination and auto-refresh controls', async () => {
        const user = userEvent.setup();
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        setIntervalSpy.mockImplementation(() => 1);
        clearIntervalSpy.mockImplementation(() => { });

        render(<EmojiStatsPanel startTime="2026-02-18T00:00:00Z" endTime="2026-02-18T12:00:00Z" />);
        await waitFor(() => expect(getEmojis).toHaveBeenCalled());

        expect(screen.getByText('表情統計')).toBeInTheDocument();
        expect(screen.getByAltText(':yt-emoji:')).toBeInTheDocument();
        expect(screen.getAllByText('Unicode').length).toBeGreaterThan(0);

        await user.selectOptions(screen.getByRole('combobox'), 'youtube');
        await waitFor(() =>
            expect(getEmojis).toHaveBeenLastCalledWith(
                expect.objectContaining({ typeFilter: 'youtube' }),
            ),
        );

        await user.click(screen.getByRole('button', { name: '刷新' }));
        expect(getEmojis).toHaveBeenLastCalledWith(
            expect.objectContaining({ offset: 0, typeFilter: 'youtube' }),
        );

        await user.click(screen.getByRole('button', { name: '下一頁' }));
        await waitFor(() =>
            expect(getEmojis).toHaveBeenLastCalledWith(
                expect.objectContaining({ offset: 20 }),
            ),
        );

        await user.click(screen.getByRole('checkbox'));
        expect(setIntervalSpy).toHaveBeenCalled();
        expect(screen.getByDisplayValue('10')).toBeInTheDocument();

        setIntervalSpy.mockRestore();
        clearIntervalSpy.mockRestore();
    });

    test('shows loading and error states correctly', () => {
        useEmojiStats.mockReturnValueOnce({
            emojis: [],
            loading: true,
            isRefreshing: false,
            error: null,
            total: 0,
            getEmojis,
        });
        const { rerender } = render(<EmojiStatsPanel startTime={null} endTime={null} />);
        expect(screen.getByTestId('emoji-skeleton')).toBeInTheDocument();

        useEmojiStats.mockReturnValueOnce({
            emojis: [],
            loading: false,
            isRefreshing: false,
            error: 'boom',
            total: 0,
            getEmojis,
        });
        rerender(<EmojiStatsPanel startTime={null} endTime={null} hasTimeFilter />);
        expect(screen.getByText('錯誤: boom')).toBeInTheDocument();

        useEmojiStats.mockReturnValueOnce({
            emojis: [],
            loading: false,
            isRefreshing: false,
            error: null,
            total: 1,
            getEmojis,
        });
        rerender(<EmojiStatsPanel startTime={null} endTime={null} hasTimeFilter />);
        expect(screen.getByRole('checkbox')).toBeDisabled();
        expect(screen.getByText(/已停用 - 時間範圍已固定/)).toBeInTheDocument();
    });
});
