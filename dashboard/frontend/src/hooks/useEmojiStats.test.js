import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useEmojiStats } from './useEmojiStats';
import { fetchEmojiStats } from '../api/emojis';

vi.mock('../api/emojis', () => ({
    fetchEmojiStats: vi.fn(),
}));

describe('useEmojiStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads emoji stats and updates state', async () => {
        fetchEmojiStats.mockResolvedValueOnce({
            emojis: [{ emoji: ':smile:', count: 2 }],
            total: 1,
        });

        const { result } = renderHook(() => useEmojiStats());

        await act(async () => {
            await result.current.getEmojis({
                startTime: '2026-02-18T00:00:00Z',
                endTime: '2026-02-18T01:00:00Z',
                limit: 20,
                offset: 0,
                isInitial: true,
            });
        });

        expect(result.current.emojis).toEqual([{ emoji: ':smile:', count: 2 }]);
        expect(result.current.total).toBe(1);
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    test('captures API error and clears refreshing flags', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchEmojiStats.mockRejectedValueOnce(new Error('emoji failed'));

        const { result } = renderHook(() => useEmojiStats());
        await act(async () => {
            await result.current.getEmojis({
                startTime: undefined,
                endTime: undefined,
                isInitial: false,
            });
        });

        expect(result.current.error).toBe('emoji failed');
        expect(result.current.loading).toBe(false);
        expect(result.current.isRefreshing).toBe(false);
        consoleErrorSpy.mockRestore();
    });
});

