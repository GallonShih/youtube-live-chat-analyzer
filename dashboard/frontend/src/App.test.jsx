import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';

const authState = {
    isAdmin: false,
    isLoading: false,
};

vi.mock('./components/common/Toast', () => ({
    ToastProvider: ({ children }) => <>{children}</>,
}));

vi.mock('./components/common/Spinner', () => ({
    default: () => <div>app-loading</div>,
}));

vi.mock('./contexts/AuthContext', () => ({
    AuthProvider: ({ children }) => <>{children}</>,
    useAuth: () => authState,
}));

vi.mock('./features/dashboard/Dashboard', () => ({
    default: () => <div>dashboard-page</div>,
}));

vi.mock('./features/admin/AdminPanel', () => ({
    default: () => <div>admin-page</div>,
}));

vi.mock('./features/playback/PlaybackPage', () => ({
    default: () => <div>playback-page</div>,
}));

vi.mock('./features/trends/TrendsPage', () => ({
    default: () => <div>trends-page</div>,
}));

vi.mock('./features/authors/AuthorPage', () => ({
    default: () => <div>author-page</div>,
}));

vi.mock('./features/authors/AuthorMessageClassificationPage', () => ({
    default: () => <div>author-classify-page</div>,
}));

describe('App routes', () => {
    beforeEach(() => {
        authState.isAdmin = false;
        authState.isLoading = false;
        window.history.pushState({}, '', '/');
    });

    test('shows spinner while auth is loading for protected route', () => {
        authState.isLoading = true;
        window.history.pushState({}, '', '/admin');
        render(<App />);
        expect(screen.getByText('app-loading')).toBeInTheDocument();
    });

    test('redirects guest from /admin to dashboard', async () => {
        authState.isAdmin = false;
        authState.isLoading = false;
        window.history.pushState({}, '', '/admin');
        render(<App />);
        await waitFor(() => expect(screen.getByText('dashboard-page')).toBeInTheDocument());
    });

    test('allows admin to access /admin and supports other routes', async () => {
        authState.isAdmin = true;
        authState.isLoading = false;
        window.history.pushState({}, '', '/admin');
        const { unmount } = render(<App />);
        expect(screen.getByText('admin-page')).toBeInTheDocument();
        unmount();

        window.history.pushState({}, '', '/playback');
        render(<App />);
        expect(screen.getByText('playback-page')).toBeInTheDocument();
    });

    test('supports author classification route', () => {
        window.history.pushState({}, '', '/authors/author_1/classify');
        render(<App />);
        expect(screen.getByText('author-classify-page')).toBeInTheDocument();
    });
});
