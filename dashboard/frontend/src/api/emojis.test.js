import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchEmojiStats } from './emojis';

const mockFetch = vi.fn();

describe('emoji api helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('fetchEmojiStats builds query params and returns data', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ emojis: [{ emoji: ':smile:' }], total: 1 }),
        });

        const data = await fetchEmojiStats({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
            limit: 20,
            offset: 10,
            filter: 'smile',
            typeFilter: 'paid_only',
        });

        expect(data.total).toBe(1);
        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/api/emojis/stats?');
        expect(calledUrl).toContain('start_time=2026-02-18T00%3A00%3A00Z');
        expect(calledUrl).toContain('end_time=2026-02-18T01%3A00%3A00Z');
        expect(calledUrl).toContain('limit=20');
        expect(calledUrl).toContain('offset=10');
        expect(calledUrl).toContain('filter=smile');
        expect(calledUrl).toContain('type_filter=paid_only');
    });

    test('fetchEmojiStats throws HTTP status on error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        await expect(fetchEmojiStats({})).rejects.toThrow('HTTP error! status: 500');
    });
});
