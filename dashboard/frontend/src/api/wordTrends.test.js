import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

import { authFetch } from './client';
import {
    fetchWordTrendGroups,
    fetchWordTrendGroup,
    createWordTrendGroup,
    updateWordTrendGroup,
    deleteWordTrendGroup,
    fetchTrendStats,
} from './wordTrends';

describe('wordTrends api helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('fetch group endpoints and parse json', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1 }] })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) });

        const groups = await fetchWordTrendGroups();
        const group = await fetchWordTrendGroup(2);

        expect(groups).toEqual([{ id: 1 }]);
        expect(group).toEqual({ id: 2 });
        expect(authFetch).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/word-trends/groups');
        expect(authFetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/word-trends/groups/2');
    });

    test('create/update include body and surface backend detail', async () => {
        authFetch
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({ detail: 'duplicate name' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: 1, name: 'A' }),
            });

        await expect(
            createWordTrendGroup({ name: 'A', words: ['x'], exclude_words: ['y'], color: '#fff' })
        ).rejects.toThrow('duplicate name');
        expect(authFetch).toHaveBeenNthCalledWith(
            1,
            'http://localhost:8000/api/word-trends/groups',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ name: 'A', words: ['x'], exclude_words: ['y'], color: '#fff' }),
            }),
        );

        const data = await updateWordTrendGroup(1, { words: ['y'], exclude_words: ['z'] });
        expect(data.id).toBe(1);
        expect(authFetch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:8000/api/word-trends/groups/1',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({ words: ['y'], exclude_words: ['z'] }),
            }),
        );
    });

    test('delete returns true and stats endpoint sends request body', async () => {
        authFetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
            .mockResolvedValueOnce({ ok: true, json: async () => [{ ts: 't', value: 1 }] });

        const deleted = await deleteWordTrendGroup(9);
        const stats = await fetchTrendStats({
            groupIds: [1, 2],
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
        });

        expect(deleted).toBe(true);
        expect(stats).toEqual([{ ts: 't', value: 1 }]);
        expect(authFetch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:8000/api/word-trends/stats',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    group_ids: [1, 2],
                    start_time: '2026-02-18T00:00:00Z',
                    end_time: '2026-02-18T01:00:00Z',
                }),
            }),
        );
    });
});
