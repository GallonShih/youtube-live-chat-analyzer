import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PlaybackPage from './PlaybackPage';
import { usePlayback } from '../../hooks/usePlayback';

vi.mock('../../components/common/Navigation', () => ({
    default: () => <div data-testid="nav" />,
}));

vi.mock('../../components/common/DynamicWordCloud', () => ({
    default: () => <div data-testid="dynamic-wordcloud" />,
}));

vi.mock('../../components/common/BarChartRace', () => ({
    default: () => <div data-testid="bar-chart-race" />,
}));

vi.mock('../../components/common/DateTimeHourSelector', () => ({
    default: ({ label, value, onChange }) => (
        <label>
            {label}
            <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
    ),
}));

vi.mock('react-chartjs-2', () => ({
    Chart: () => <div data-testid="playback-chart" />,
}));

vi.mock('react-grid-layout', () => ({
    Responsive: ({ children }) => <div data-testid="responsive-grid">{children}</div>,
    useContainerWidth: () => ({ width: 1200, containerRef: { current: null }, mounted: true }),
}));

vi.mock('../../utils/chartSetup', () => ({
    registerChartComponents: vi.fn(),
    hourGridPlugin: {},
}));

vi.mock('../../hooks/useDefaultStartTime', () => ({
    useDefaultStartTime: () => ({ defaultStartTime: '2026-02-18T00:00', loading: false }),
}));

vi.mock('../../hooks/useWordlists', () => ({
    useWordlists: () => ({ savedWordlists: [{ id: 1, name: 'WL1' }], loading: false }),
}));

vi.mock('../../hooks/useReplacementWordlists', () => ({
    useReplacementWordlists: () => ({ savedWordlists: [{ id: 2, name: 'RWL1' }], loading: false }),
}));

const resetLayoutMock = vi.fn();
const handleLayoutChangeMock = vi.fn();

vi.mock('../../hooks/usePlaybackLayout', () => ({
    usePlaybackLayout: () => ({
        layout: [
            { i: 'controls', x: 0, y: 0, w: 12, h: 5 },
            { i: 'stats', x: 0, y: 5, w: 12, h: 4 },
            { i: 'chart', x: 0, y: 9, w: 12, h: 10 },
            { i: 'wordcloud', x: 0, y: 19, w: 7, h: 14 },
            { i: 'barrace', x: 7, y: 19, w: 5, h: 14 },
        ],
        handleLayoutChange: handleLayoutChangeMock,
        resetLayout: resetLayoutMock,
    }),
}));

vi.mock('../../hooks/usePlayback', () => ({
    usePlayback: vi.fn(),
}));

const makeHook = (overrides = {}) => ({
    snapshots: [
        {
            timestamp: '2026-02-18T00:00:00Z',
            viewer_count: 100,
            hourly_messages: 20,
            paid_message_count: 2,
            revenue_twd: 300,
        },
        {
            timestamp: '2026-02-18T01:00:00Z',
            viewer_count: 120,
            hourly_messages: 30,
            paid_message_count: 3,
            revenue_twd: 500,
        },
    ],
    metadata: { total: 2 },
    currentIndex: 0,
    setCurrentIndex: vi.fn(),
    isPlaying: false,
    setIsPlaying: vi.fn(),
    isLoading: false,
    error: null,
    wordcloudSnapshots: [{ words: [{ text: 'a', value: 1 }] }, { words: [{ text: 'b', value: 2 }] }],
    wordcloudLoading: false,
    wordcloudError: null,
    loadSnapshots: vi.fn(),
    loadWordcloudSnapshots: vi.fn(),
    togglePlayback: vi.fn(),
    ...overrides,
});

describe('PlaybackPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads playback data with selected config', async () => {
        const hook = makeHook();
        usePlayback.mockReturnValue(hook);
        const user = userEvent.setup();
        render(<PlaybackPage />);

        await user.type(screen.getByLabelText('開始時間'), '2026-02-18T00:00');
        await user.type(screen.getByLabelText('結束時間'), '2026-02-18T02:00');
        await user.selectOptions(screen.getByDisplayValue('5 分鐘'), '60');
        await user.selectOptions(screen.getByDisplayValue('4 小時'), '8');
        await user.selectOptions(screen.getByDisplayValue('30'), '50');
        const wordlistSelects = screen.getAllByDisplayValue('不使用清單');
        await user.selectOptions(wordlistSelects[0], '1');
        await user.selectOptions(wordlistSelects[1], '2');
        await user.click(screen.getByRole('button', { name: '載入資料' }));

        await waitFor(() => expect(hook.loadSnapshots).toHaveBeenCalled());
        expect(hook.loadWordcloudSnapshots).toHaveBeenCalledWith(expect.objectContaining({
            stepSeconds: 60,
            windowHours: 8,
            wordLimit: 50,
            wordlistId: 1,
            replacementWordlistId: 2,
        }));
    });

    test('renders playback panels and supports playback/reset controls', async () => {
        const hook = makeHook();
        usePlayback.mockReturnValue(hook);
        const user = userEvent.setup();

        render(<PlaybackPage />);

        expect(screen.getByTestId('responsive-grid')).toBeInTheDocument();
        expect(screen.getByTestId('playback-chart')).toBeInTheDocument();
        expect(screen.getByTestId('dynamic-wordcloud')).toBeInTheDocument();
        expect(screen.getByTestId('bar-chart-race')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '重置佈局' }));
        expect(resetLayoutMock).toHaveBeenCalledTimes(1);

        // Toggle playback button (rendered as first round icon button in controls)
        const iconButtons = screen.getAllByRole('button');
        await user.click(iconButtons.find((btn) => btn.className.includes('rounded-full')) || iconButtons[0]);
        expect(hook.togglePlayback).toHaveBeenCalledTimes(1);
    });
});
