import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

import { authFetch } from './client';
import {
    fetchReplacementWordlists,
    fetchReplacementWordlist,
    createReplacementWordlist,
    updateReplacementWordlist,
    deleteReplacementWordlist,
} from './replacement_wordlist';

describe('replacement wordlist api helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('list/get/create/update/delete work on expected endpoints', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1 }] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, replacements: [] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

        expect(await fetchReplacementWordlists()).toEqual([{ id: 1 }]);
        expect(await fetchReplacementWordlist(1)).toEqual({ id: 1 });
        expect(await createReplacementWordlist({ name: 'n', replacements: [] })).toEqual({ id: 2 });
        expect(await updateReplacementWordlist(1, { replacements: [] })).toEqual({ id: 1, replacements: [] });
        expect(await deleteReplacementWordlist(1)).toBe(true);
    });

    test('createReplacementWordlist surfaces backend detail on error', async () => {
        authFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ detail: 'name exists' }),
        });

        await expect(createReplacementWordlist({ name: 'n', replacements: [] })).rejects.toThrow('name exists');
    });
});

