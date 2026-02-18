import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Navigation from './Navigation';

const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => mockUseAuth(),
}));

describe('Navigation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('guest can open login modal and login successfully', async () => {
        const login = vi.fn().mockResolvedValue({ success: true });
        mockUseAuth.mockReturnValue({
            isAdmin: false,
            login,
            logout: vi.fn(),
        });

        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: /訪客/i }));
        await user.click(screen.getAllByRole('button', { name: '切換為管理員' })[0]);
        expect(screen.getByText('請輸入管理員密碼')).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText('密碼'), 'secret');
        await user.click(screen.getByRole('button', { name: '登入' }));
        await waitFor(() => expect(login).toHaveBeenCalledWith('secret'));
        await waitFor(() => expect(screen.queryByText('請輸入管理員密碼')).not.toBeInTheDocument());
    });

    test('shows login error for failed login', async () => {
        const login = vi.fn().mockResolvedValue({ success: false, error: '密碼錯誤' });
        mockUseAuth.mockReturnValue({
            isAdmin: false,
            login,
            logout: vi.fn(),
        });

        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: /訪客/i }));
        await user.click(screen.getAllByRole('button', { name: '切換為管理員' })[0]);
        await user.click(screen.getByRole('button', { name: '登入' }));
        await waitFor(() => expect(screen.getByText('密碼錯誤')).toBeInTheDocument());
    });

    test('admin can logout from role menu and sees admin nav link', async () => {
        const logout = vi.fn();
        mockUseAuth.mockReturnValue({
            isAdmin: true,
            login: vi.fn(),
            logout,
        });

        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <Navigation />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: /Admin/i })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Admin/i }));
        await user.click(screen.getAllByRole('button', { name: '切換為訪客' })[0]);
        expect(logout).toHaveBeenCalled();
    });
});
