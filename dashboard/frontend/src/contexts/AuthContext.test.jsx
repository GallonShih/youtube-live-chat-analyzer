import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const ACCESS_TOKEN_KEY = 'yt_chat_analyzer_access_token';
const REFRESH_TOKEN_KEY = 'yt_chat_analyzer_refresh_token';
const AUTH_STORAGE_KEY = 'yt_chat_analyzer_auth';

function Consumer() {
    const { role, isLoading, login, logout } = useAuth();
    return (
        <div>
            <span data-testid="role">{role}</span>
            <span data-testid="loading">{String(isLoading)}</span>
            <button onClick={() => login('pw')}>do-login</button>
            <button onClick={() => logout()}>do-logout</button>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        global.fetch = vi.fn();
    });

    test('initializes as admin when stored token is valid', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'access-token');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ role: 'admin' }),
        });

        render(
            <AuthProvider>
                <Consumer />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('role')).toHaveTextContent('admin');
    });

    test('refreshes token when /me returns 401 and refresh token exists', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'old-access');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');
        fetch
            .mockResolvedValueOnce({ ok: false, status: 401 })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'new-access' }),
            });

        render(
            <AuthProvider>
                <Consumer />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('role')).toHaveTextContent('admin');
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-access');
    });

    test('supports login and logout flow', async () => {
        fetch
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: 'acc', refresh_token: 'ref' }),
            })
            .mockResolvedValueOnce({ ok: true });

        const user = userEvent.setup();
        render(
            <AuthProvider>
                <Consumer />
            </AuthProvider>,
        );

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('role')).toHaveTextContent('guest');

        await user.click(screen.getByRole('button', { name: 'do-login' }));
        await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('admin'));
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('acc');
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('ref');

        await user.click(screen.getByRole('button', { name: 'do-logout' }));
        await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('guest'));
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
        expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe('guest');
    });
});
