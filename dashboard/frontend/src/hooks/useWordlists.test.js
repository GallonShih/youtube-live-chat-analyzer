import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useWordlists } from './useWordlists';
import * as api from '../api/wordcloud';

vi.mock('../api/wordcloud', () => ({
    fetchWordlists: vi.fn(),
    fetchWordlist: vi.fn(),
    createWordlist: vi.fn(),
    updateWordlist: vi.fn(),
    deleteWordlist: vi.fn(),
}));

describe('useWordlists', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads wordlists on mount and supports CRUD refresh flow', async () => {
        api.fetchWordlists
            .mockResolvedValueOnce([{ id: 1, name: 'A' }])
            .mockResolvedValueOnce([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
            .mockResolvedValueOnce([{ id: 1, name: 'A' }, { id: 2, name: 'B' }])
            .mockResolvedValueOnce([{ id: 2, name: 'B' }]);
        api.createWordlist.mockResolvedValueOnce({ id: 2 });
        api.updateWordlist.mockResolvedValueOnce({ id: 1 });
        api.deleteWordlist.mockResolvedValueOnce(true);
        api.fetchWordlist.mockResolvedValueOnce({ id: 1, words: ['x'] });

        const { result } = renderHook(() => useWordlists());

        await waitFor(() => expect(result.current.savedWordlists).toEqual([{ id: 1, name: 'A' }]));

        await act(async () => {
            await result.current.saveWordlist('B', ['b']);
        });
        await act(async () => {
            await result.current.updateWordlist(1, ['x']);
        });
        await act(async () => {
            await result.current.removeWordlist(1);
        });
        const one = await result.current.getWordlist(1);

        expect(one).toEqual({ id: 1, words: ['x'] });
        expect(api.fetchWordlists).toHaveBeenCalledTimes(4);
    });

    test('keeps error when initial load fails', async () => {
        api.fetchWordlists.mockRejectedValueOnce(new Error('load failed'));

        const { result } = renderHook(() => useWordlists());
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.error).toBe('load failed');
    });
});

