import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { usePlayback } from './usePlayback';
import { fetchPlaybackSnapshots, fetchPlaybackWordCloudSnapshots } from '../api/playback';

vi.mock('../api/playback', () => ({
    fetchPlaybackSnapshots: vi.fn(),
    fetchPlaybackWordCloudSnapshots: vi.fn(),
}));

describe('usePlayback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loadSnapshots returns early when date range is missing', async () => {
        const { result } = renderHook(() => usePlayback());

        let ret;
        await act(async () => {
            ret = await result.current.loadSnapshots({ startDate: '', endDate: '', stepSeconds: 30 });
        });

        expect(ret).toBeUndefined();
        expect(fetchPlaybackSnapshots).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false);
    });

    test('loadSnapshots stores snapshots/metadata and resets index on success', async () => {
        fetchPlaybackSnapshots.mockResolvedValue({
            snapshots: [{ timestamp: '2026-02-18T00:00:00.000Z' }],
            metadata: { totalSnapshots: 1 },
        });

        const { result } = renderHook(() => usePlayback());

        await act(async () => {
            const ok = await result.current.loadSnapshots({
                startDate: '2026-02-18T00:00',
                endDate: '2026-02-18T01:00',
                stepSeconds: 60,
            });
            expect(ok).toBe(true);
        });

        const expectedStartIso = new Date('2026-02-18T00:00').toISOString();
        const expectedEndIso = new Date('2026-02-18T01:00').toISOString();
        expect(fetchPlaybackSnapshots).toHaveBeenCalledWith({
            startTime: expectedStartIso,
            endTime: expectedEndIso,
            stepSeconds: 60,
        });
        expect(result.current.snapshots).toEqual([{ timestamp: '2026-02-18T00:00:00.000Z' }]);
        expect(result.current.metadata).toEqual({ totalSnapshots: 1 });
        expect(result.current.currentIndex).toBe(0);
        expect(result.current.error).toBeNull();
    });

    test('loadSnapshots sets error on failure and returns false', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchPlaybackSnapshots.mockRejectedValue(new Error('load failed'));

        const { result } = renderHook(() => usePlayback());

        await act(async () => {
            const ok = await result.current.loadSnapshots({
                startDate: '2026-02-18T00:00',
                endDate: '2026-02-18T01:00',
                stepSeconds: 60,
            });
            expect(ok).toBe(false);
        });

        expect(result.current.error).toBe('load failed');
        expect(result.current.isLoading).toBe(false);
        consoleErrorSpy.mockRestore();
    });

    test('togglePlayback only works when snapshots exist', async () => {
        const { result } = renderHook(() => usePlayback());

        act(() => {
            result.current.togglePlayback();
        });
        expect(result.current.isPlaying).toBe(false);

        fetchPlaybackSnapshots.mockResolvedValue({
            snapshots: [{ timestamp: '2026-02-18T00:00:00.000Z' }],
            metadata: {},
        });

        await act(async () => {
            await result.current.loadSnapshots({
                startDate: '2026-02-18T00:00',
                endDate: '2026-02-18T01:00',
                stepSeconds: 60,
            });
        });

        act(() => {
            result.current.togglePlayback();
        });
        expect(result.current.isPlaying).toBe(true);

        act(() => {
            result.current.togglePlayback();
        });
        expect(result.current.isPlaying).toBe(false);
    });

    test('loadWordcloudSnapshots updates data and handles failure', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchPlaybackWordCloudSnapshots
            .mockResolvedValueOnce({ snapshots: [{ words: [{ text: 'hello', value: 1 }] }] })
            .mockRejectedValueOnce(new Error('wordcloud failed'));

        const { result } = renderHook(() => usePlayback());

        await act(async () => {
            await result.current.loadWordcloudSnapshots({
                startDate: '2026-02-18T00:00',
                endDate: '2026-02-18T01:00',
                stepSeconds: 60,
                windowHours: 2,
                wordLimit: 100,
                wordlistId: 1,
                replacementWordlistId: 2,
            });
        });

        const expectedStartIso = new Date('2026-02-18T00:00').toISOString();
        const expectedEndIso = new Date('2026-02-18T01:00').toISOString();
        expect(fetchPlaybackWordCloudSnapshots).toHaveBeenCalledWith({
            startTime: expectedStartIso,
            endTime: expectedEndIso,
            stepSeconds: 60,
            windowHours: 2,
            wordLimit: 100,
            wordlistId: 1,
            replacementWordlistId: 2,
        });
        expect(result.current.wordcloudSnapshots).toEqual([{ words: [{ text: 'hello', value: 1 }] }]);
        expect(result.current.wordcloudError).toBeNull();

        await act(async () => {
            await result.current.loadWordcloudSnapshots({
                startDate: '2026-02-18T00:00',
                endDate: '2026-02-18T01:00',
                stepSeconds: 60,
                windowHours: 2,
                wordLimit: 100,
            });
        });

        expect(result.current.wordcloudError).toBe('wordcloud failed');
        expect(result.current.wordcloudLoading).toBe(false);
        consoleErrorSpy.mockRestore();
    });
});
