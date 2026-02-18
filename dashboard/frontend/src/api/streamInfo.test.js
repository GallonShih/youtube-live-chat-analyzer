import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchStreamInfo } from './streamInfo';

const mockFetch = vi.fn();

describe('streamInfo api helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('fetchStreamInfo returns json body when ok', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ title: 'Live Stream' }),
        });

        const data = await fetchStreamInfo();
        expect(data.title).toBe('Live Stream');
        expect(mockFetch.mock.calls[0][0]).toContain('/api/stream-info');
    });

    test('fetchStreamInfo throws on error status', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
        });

        await expect(fetchStreamInfo()).rejects.toThrow('API error: 404');
    });
});

