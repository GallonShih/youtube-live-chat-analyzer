import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import SettingsManager from './SettingsManager';
import { authFetch } from '../../api/client';

vi.mock('../../api/client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

vi.mock('../../components/common/DateTimeHourSelector', () => ({
    default: ({ label, value, onChange }) => (
        <label>
            {label}
            <input
                aria-label={label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </label>
    ),
}));

describe('SettingsManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads existing settings and validates youtube URL before save', async () => {
        authFetch
            .mockResolvedValueOnce({
                json: async () => ({ value: 'https://www.youtube.com/watch?v=abcdefghijk', updated_at: '2026-02-18T00:00:00Z' }),
            })
            .mockResolvedValueOnce({
                json: async () => ({ value: '2026-02-18T00:00:00Z' }),
            });

        const user = userEvent.setup();
        render(<SettingsManager />);

        await waitFor(() => expect(screen.getByDisplayValue('https://www.youtube.com/watch?v=abcdefghijk')).toBeInTheDocument());
        expect(screen.getByText(/Video ID/)).toBeInTheDocument();

        const urlInput = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
        await user.clear(urlInput);
        await user.type(urlInput, 'invalid-url');
        await user.click(screen.getAllByRole('button', { name: '儲存設定' })[0]);
        expect(screen.getByText('請輸入有效的 YouTube URL')).toBeInTheDocument();
    });

    test('saves youtube/default period and clears period', async () => {
        authFetch.mockImplementation(async (url, options = {}) => {
            if (url.includes('/youtube_url')) {
                return { json: async () => ({ value: 'https://www.youtube.com/watch?v=abcdefghijk', updated_at: '2026-02-18T00:00:00Z' }) };
            }
            if (url.includes('/default_start_time') && !options.method) {
                return { json: async () => ({ value: '2026-02-18T00:00:00Z' }) };
            }
            if (options.method === 'DELETE') {
                return { ok: true, json: async () => ({ success: true }) };
            }
            return { json: async () => ({ success: true }) };
        });

        const user = userEvent.setup();
        render(<SettingsManager />);

        await waitFor(() => expect(screen.getByPlaceholderText('https://www.youtube.com/watch?v=...')).toBeInTheDocument());

        const urlInput = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
        await user.clear(urlInput);
        await user.type(urlInput, 'https://www.youtube.com/watch?v=ZYXWVUTSRQP');
        await user.click(screen.getAllByRole('button', { name: '儲存設定' })[0]);
        await waitFor(() => expect(screen.getByText('設定已儲存！Worker 將在 30 秒內更新。')).toBeInTheDocument());

        const periodInput = screen.getByLabelText('預設開始時間');
        await user.clear(periodInput);
        await user.type(periodInput, '2026-02-18T01:00');
        await user.click(screen.getAllByRole('button', { name: '儲存設定' })[1]);
        await waitFor(() => expect(screen.getByText('預設時間區間已儲存！')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '清除設定' }));
        await waitFor(() => expect(screen.getByText('預設時間區間已清除，各頁面將恢復預設行為。')).toBeInTheDocument());
    });
});
