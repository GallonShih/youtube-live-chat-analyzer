import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import StreamInfoBar from './StreamInfoBar';
import { fetchStreamInfo } from '../../api/streamInfo';

vi.mock('../../api/streamInfo', () => ({
    fetchStreamInfo: vi.fn(),
}));

describe('StreamInfoBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('renders stream info and refreshes by interval', async () => {
        fetchStreamInfo.mockResolvedValue({
            stream: {
                live_broadcast_content: 'live',
                video_id: 'abc123',
                thumbnail_url: 'https://example.com/thumbnail.jpg',
                channel_title: 'Demo Channel',
                title: 'Live title',
                stats: {
                    concurrent_viewers: 1234,
                    view_count: 5678,
                    like_count: 90,
                },
            },
        });

        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
        setIntervalSpy.mockImplementation(() => {
            return 1;
        });
        clearIntervalSpy.mockImplementation(() => { });

        const { unmount } = render(<StreamInfoBar />);

        await waitFor(() => expect(fetchStreamInfo).toHaveBeenCalledTimes(1));
        expect(screen.getByText('LIVE')).toBeInTheDocument();
        expect(screen.getByText('Demo Channel')).toBeInTheDocument();
        expect(screen.getByText('Live title')).toBeInTheDocument();
        expect(screen.getByText('1,234')).toBeInTheDocument();
        expect(screen.getByText('5,678')).toBeInTheDocument();

        expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);

        unmount();
        expect(clearIntervalSpy).toHaveBeenCalled();
        setIntervalSpy.mockRestore();
        clearIntervalSpy.mockRestore();
    });

    test('handles fetch error and keeps hidden when data not available', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        fetchStreamInfo.mockRejectedValue(new Error('network failed'));

        const { container } = render(<StreamInfoBar />);
        await waitFor(() => expect(fetchStreamInfo).toHaveBeenCalledTimes(1));

        expect(container.firstChild).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});
