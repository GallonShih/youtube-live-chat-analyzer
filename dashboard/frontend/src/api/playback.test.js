import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    fetchPlaybackSnapshots,
    fetchPlaybackWordCloudSnapshots,
} from './playback';

const mockFetch = vi.fn();

describe('playback api helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test('fetchPlaybackSnapshots sends query params and returns json', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ snapshots: [], metadata: { totalSnapshots: 0 } }),
        });

        const data = await fetchPlaybackSnapshots({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
            stepSeconds: 60,
        });

        expect(data.metadata.totalSnapshots).toBe(0);
        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/api/playback/snapshots?');
        expect(calledUrl).toContain('start_time=2026-02-18T00%3A00%3A00Z');
        expect(calledUrl).toContain('end_time=2026-02-18T01%3A00%3A00Z');
        expect(calledUrl).toContain('step_seconds=60');
    });

    test('fetchPlaybackSnapshots throws backend detail on non-200', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 422,
            json: async () => ({ detail: 'invalid time range' }),
        });

        await expect(
            fetchPlaybackSnapshots({
                startTime: '2026-02-18T00:00:00Z',
                endTime: '2026-02-18T01:00:00Z',
                stepSeconds: 60,
            }),
        ).rejects.toThrow('invalid time range');
    });

    test('fetchPlaybackWordCloudSnapshots includes optional wordlist params', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ snapshots: [] }),
        });

        await fetchPlaybackWordCloudSnapshots({
            startTime: '2026-02-18T00:00:00Z',
            endTime: '2026-02-18T01:00:00Z',
            stepSeconds: 60,
            windowHours: 4,
            wordLimit: 100,
            wordlistId: 8,
            replacementWordlistId: 9,
        });

        const calledUrl = mockFetch.mock.calls[0][0];
        expect(calledUrl).toContain('/api/playback/word-frequency-snapshots?');
        expect(calledUrl).toContain('window_hours=4');
        expect(calledUrl).toContain('word_limit=100');
        expect(calledUrl).toContain('wordlist_id=8');
        expect(calledUrl).toContain('replacement_wordlist_id=9');
    });

    test('fetchPlaybackWordCloudSnapshots throws fallback status message', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({}),
        });

        await expect(
            fetchPlaybackWordCloudSnapshots({
                startTime: '2026-02-18T00:00:00Z',
                endTime: '2026-02-18T01:00:00Z',
                stepSeconds: 60,
                windowHours: 4,
                wordLimit: 100,
            }),
        ).rejects.toThrow('HTTP error! status: 500');
    });
});
