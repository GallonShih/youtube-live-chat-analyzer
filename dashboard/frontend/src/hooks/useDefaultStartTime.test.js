import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../api/client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

vi.mock('../utils/formatters', () => ({
    formatLocalHour: vi.fn(() => '2026-02-18T12:00'),
}));

import { authFetch } from '../api/client';
import { formatLocalHour } from '../utils/formatters';
import { useDefaultStartTime } from './useDefaultStartTime';

describe('useDefaultStartTime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads and formats default start time from backend setting', async () => {
        authFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ value: '2026-02-18T12:34:56Z' }),
        });

        const { result } = renderHook(() => useDefaultStartTime());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(authFetch).toHaveBeenCalledWith('http://localhost:8000/api/admin/settings/default_start_time');
        expect(formatLocalHour).toHaveBeenCalledWith(new Date('2026-02-18T12:34:56Z'));
        expect(result.current.defaultStartTime).toBe('2026-02-18T12:00');
    });

    test('keeps null when backend has no setting value', async () => {
        authFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ value: null }),
        });

        const { result } = renderHook(() => useDefaultStartTime());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(formatLocalHour).not.toHaveBeenCalled();
        expect(result.current.defaultStartTime).toBeNull();
    });

    test('fails gracefully when request is not ok', async () => {
        authFetch.mockResolvedValue({
            ok: false,
            json: async () => ({}),
        });

        const { result } = renderHook(() => useDefaultStartTime());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.defaultStartTime).toBeNull();
    });
});
