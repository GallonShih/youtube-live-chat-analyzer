import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useReplacementWordlists } from './useReplacementWordlists';
import * as api from '../api/replacement_wordlist';

vi.mock('../api/replacement_wordlist', () => ({
    fetchReplacementWordlists: vi.fn(),
    fetchReplacementWordlist: vi.fn(),
    createReplacementWordlist: vi.fn(),
    updateReplacementWordlist: vi.fn(),
    deleteReplacementWordlist: vi.fn(),
}));

describe('useReplacementWordlists', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads and refreshes replacement wordlists after mutations', async () => {
        api.fetchReplacementWordlists
            .mockResolvedValueOnce([{ id: 1 }])
            .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
            .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
            .mockResolvedValueOnce([{ id: 2 }]);
        api.createReplacementWordlist.mockResolvedValueOnce({ id: 2 });
        api.updateReplacementWordlist.mockResolvedValueOnce({ id: 1 });
        api.deleteReplacementWordlist.mockResolvedValueOnce(true);
        api.fetchReplacementWordlist.mockResolvedValueOnce({ id: 2, replacements: [] });

        const { result } = renderHook(() => useReplacementWordlists());
        await waitFor(() => expect(result.current.savedWordlists).toEqual([{ id: 1 }]));

        await act(async () => {
            await result.current.saveWordlist('N', []);
        });
        await act(async () => {
            await result.current.updateWordlist(1, []);
        });
        await act(async () => {
            await result.current.removeWordlist(1);
        });
        const one = await result.current.getWordlist(2);

        expect(one).toEqual({ id: 2, replacements: [] });
        expect(api.fetchReplacementWordlists).toHaveBeenCalledTimes(4);
    });
});

