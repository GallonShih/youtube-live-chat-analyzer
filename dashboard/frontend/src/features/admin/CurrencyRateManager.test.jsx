import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import CurrencyRateManager from './CurrencyRateManager';
import { authFetch } from '../../api/client';

const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
};

vi.mock('../../components/common/Toast', () => ({
    useToast: () => toast,
}));

vi.mock('../../api/client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

describe('CurrencyRateManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });

    test('loads rates/unknown currencies and supports quick add', async () => {
        authFetch.mockImplementation(async (url) => {
            if (url.includes('/unknown')) {
                return { json: async () => ({ unknown_currencies: [{ currency: 'USD', message_count: 3 }] }) };
            }
            return {
                json: async () => ({
                    rates: [{ currency: 'JPY', rate_to_twd: 0.21, updated_at: '2026-02-18T00:00:00Z', notes: 'n' }],
                }),
            };
        });
        const user = userEvent.setup();
        render(<CurrencyRateManager />);

        await waitFor(() => expect(screen.getByText('Configured Rates (1)')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /USD/ }));
        expect(screen.getByLabelText('Currency Code *')).toHaveValue('USD');
    });

    test('warns when required fields are missing and submits success flow', async () => {
        authFetch.mockImplementation(async (url, options = {}) => {
            if (options.method === 'POST') {
                return { json: async () => ({ success: true, message: 'saved ok' }) };
            }
            if (url.includes('/unknown')) {
                return { json: async () => ({ unknown_currencies: [] }) };
            }
            return { json: async () => ({ rates: [] }) };
        });
        const user = userEvent.setup();
        render(<CurrencyRateManager />);

        await waitFor(() => expect(screen.getByText('Configured Rates (0)')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /Add Rate/i }));
        expect(toast.warning).toHaveBeenCalledWith('Please fill in currency code and rate');

        await user.type(screen.getByLabelText('Currency Code *'), 'usd');
        await user.type(screen.getByLabelText('Rate to TWD *'), '31.5');
        await user.click(screen.getByRole('button', { name: /Add Rate/i }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('saved ok'));
        expect(authFetch.mock.calls.some(([url, opt]) =>
            url.includes('/api/admin/currency-rates') && opt?.method === 'POST')).toBe(true);
    });
});

