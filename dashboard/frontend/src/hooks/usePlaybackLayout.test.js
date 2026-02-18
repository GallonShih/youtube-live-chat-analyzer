import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { usePlaybackLayout } from './usePlaybackLayout';

const STORAGE_KEY = 'playback-layout';

describe('usePlaybackLayout', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('uses default layout when no saved config exists', () => {
        const { result } = renderHook(() => usePlaybackLayout());
        expect(result.current.layout).toEqual(result.current.defaultLayout);
    });

    test('loads valid saved layout from localStorage and persists updates', () => {
        const savedLayout = [
            { i: 'controls', x: 0, y: 0, w: 12, h: 5 },
            { i: 'stats', x: 0, y: 5, w: 12, h: 4 },
            { i: 'chart', x: 0, y: 9, w: 12, h: 10 },
            { i: 'wordcloud', x: 0, y: 19, w: 7, h: 14 },
            { i: 'barrace', x: 7, y: 19, w: 5, h: 14 },
        ];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLayout));

        const { result } = renderHook(() => usePlaybackLayout());
        expect(result.current.layout).toEqual(savedLayout);

        act(() => {
            result.current.handleLayoutChange([
                ...savedLayout,
                { i: 'unknown', x: 0, y: 0, w: 1, h: 1 },
            ]);
        });
        expect(result.current.layout).toEqual(savedLayout);
    });

    test('falls back to default on malformed localStorage and can reset', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        localStorage.setItem(STORAGE_KEY, 'not-json');

        const { result } = renderHook(() => usePlaybackLayout());
        expect(result.current.layout).toEqual(result.current.defaultLayout);

        act(() => {
            result.current.resetLayout();
        });
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        expect(warnSpy).toHaveBeenCalled();
    });
});
