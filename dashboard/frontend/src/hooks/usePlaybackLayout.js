import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'playback-layout';

// Default layout for the 5 chart blocks
// Using a 12-column grid system
const DEFAULT_LAYOUT = [
    { i: 'controls', x: 0, y: 0, w: 12, h: 5, minW: 6, minH: 4 },
    { i: 'stats', x: 0, y: 5, w: 12, h: 4, minW: 6, minH: 3 },
    { i: 'chart', x: 0, y: 9, w: 12, h: 10, minW: 6, minH: 6 },
    { i: 'wordcloud', x: 0, y: 19, w: 7, h: 14, minW: 4, minH: 8 },
    { i: 'barrace', x: 7, y: 19, w: 5, h: 14, minW: 3, minH: 8 },
];

/**
 * Custom hook for managing Playback page grid layout
 * with localStorage persistence
 */
export function usePlaybackLayout() {
    // Initialize layout from localStorage or use default
    const [layout, setLayout] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate that all required items exist
                const requiredKeys = ['controls', 'stats', 'chart', 'wordcloud', 'barrace'];
                const hasAllKeys = requiredKeys.every(key =>
                    parsed.some(item => item.i === key)
                );
                if (hasAllKeys) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Failed to load layout from localStorage:', e);
        }
        return DEFAULT_LAYOUT;
    });

    // Persist layout changes to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
        } catch (e) {
            console.warn('Failed to save layout to localStorage:', e);
        }
    }, [layout]);

    // Handle layout change from react-grid-layout
    const handleLayoutChange = useCallback((newLayout) => {
        const filteredLayout = newLayout.filter(item =>
            ['controls', 'stats', 'chart', 'wordcloud', 'barrace'].includes(item.i)
        );
        if (filteredLayout.length === 5) {
            setLayout(filteredLayout);
        }
    }, []);

    // Reset to default layout
    const resetLayout = useCallback(() => {
        setLayout(DEFAULT_LAYOUT);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return {
        layout,
        handleLayoutChange,
        resetLayout,
        defaultLayout: DEFAULT_LAYOUT
    };
}

export default usePlaybackLayout;
