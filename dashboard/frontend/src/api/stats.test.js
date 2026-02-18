import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    fetchViewersStats,
    fetchCommentsStats,
    fetchMoneySummary,
} from './stats';

const mockFetch = vi.fn();

describe('stats api helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('fetchViewersStats uses hours when no explicit range provided', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ time: '2026-02-18T00:00:00Z', count: 10 }],
        });

        const data = await fetchViewersStats({ hours: 12 });

        expect(data).toEqual([{ time: '2026-02-18T00:00:00Z', count: 10 }]);
        expect(mockFetch.mock.calls[0][0]).toContain('/api/stats/viewers?hours=12');
    });

    test('fetchCommentsStats sends start/end query params', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ hour: '2026-02-18T00:00:00Z', count: 20 }],
        });

        await fetchCommentsStats({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
        });

        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/api/stats/comments?');
        expect(calledUrl).toContain('start_time=2026-02-18T00%3A00%3A00Z');
        expect(calledUrl).toContain('end_time=2026-02-18T01%3A00%3A00Z');
    });

    test('fetchCommentsStats throws on non-200 response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 503,
        });

        await expect(fetchCommentsStats({ hours: 12 })).rejects.toThrow('API error: 503');
    });

    test('fetchMoneySummary returns parsed body and throws HTTP status on failure', async () => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ total_amount: 999 }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

        const data = await fetchMoneySummary({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
        });
        expect(data.total_amount).toBe(999);

        const firstUrl = mockFetch.mock.calls[0][0];
        expect(firstUrl).toContain('/api/stats/money-summary?');
        expect(firstUrl).toContain('start_time=2026-02-18T00%3A00%3A00Z');
        expect(firstUrl).toContain('end_time=2026-02-18T01%3A00%3A00Z');

        await expect(fetchMoneySummary({})).rejects.toThrow('HTTP error! status: 500');
    });
});
