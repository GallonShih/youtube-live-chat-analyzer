import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useWordFrequency } from './useWordFrequency';
import { fetchWordFrequency } from '../api/wordcloud';

vi.mock('../api/wordcloud', () => ({
    fetchWordFrequency: vi.fn(),
}));

describe('useWordFrequency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('uses default 12h window and maps words for cloud', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-18T12:00:00.000Z').getTime());
        fetchWordFrequency.mockResolvedValueOnce({
            words: [{ word: 'hello', count: 3 }],
            total_messages: 10,
            unique_words: 1,
        });

        const { result } = renderHook(() => useWordFrequency());
        await act(async () => {
            await result.current.getWordFrequency({});
        });

        expect(fetchWordFrequency).toHaveBeenCalledWith(
            expect.objectContaining({
                startTime: '2026-02-18T00:00:00.000Z',
                limit: 100,
            }),
        );
        expect(result.current.wordData).toEqual([{ text: 'hello', value: 3 }]);
        expect(result.current.stats).toEqual({ total_messages: 10, unique_words: 1 });
    });

    test('sets error state when request fails', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchWordFrequency.mockRejectedValueOnce(new Error('word failed'));

        const { result } = renderHook(() => useWordFrequency());
        await act(async () => {
            await result.current.getWordFrequency({ startTime: '2026-02-18T00:00:00Z' });
        });

        expect(result.current.error).toBe('word failed');
        expect(result.current.loading).toBe(false);
        consoleErrorSpy.mockRestore();
    });
});

