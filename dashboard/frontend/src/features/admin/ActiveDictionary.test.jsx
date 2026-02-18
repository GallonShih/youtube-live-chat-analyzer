import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ActiveDictionary from './ActiveDictionary';
import { authFetch } from '../../api/client';

vi.mock('../../api/client', () => ({
    default: 'http://localhost:8000',
    authFetch: vi.fn(),
}));

vi.mock('./ConfirmModal', () => ({
    default: ({ isOpen, onConfirm, onCancel, title, message }) =>
        isOpen ? (
            <div data-testid="confirm-modal">
                <span>{title}</span>
                <span>{message}</span>
                <button onClick={onConfirm}>confirm-delete</button>
                <button onClick={onCancel}>cancel-delete</button>
            </div>
        ) : null,
}));

describe('ActiveDictionary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });

    test('loads replace items then can switch to special tab', async () => {
        authFetch.mockImplementation(async (url) => {
            if (url.includes('active-special-words')) {
                return {
                    json: async () => ({
                        items: [{ id: 2, word: 'x', created_at: '2026-02-18T00:00:00Z' }],
                        total: 1,
                    }),
                };
            }
            return {
                json: async () => ({
                    items: [{ id: 1, source_word: 'a', target_word: 'b', created_at: '2026-02-18T00:00:00Z' }],
                    total: 1,
                }),
            };
        });

        const user = userEvent.setup();
        render(<ActiveDictionary />);

        await waitFor(() => expect(screen.getByText('b')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: 'Special Words' }));
        await waitFor(() => expect(screen.getByText('x')).toBeInTheDocument());

        expect(authFetch.mock.calls[0][0]).toContain('/api/admin/active-replace-words?');
        expect(authFetch.mock.calls.some(([url]) => url.includes('/api/admin/active-special-words?'))).toBe(true);
    });

    test('supports search and page navigation requests', async () => {
        authFetch.mockImplementation(async (url) => {
            if (url.includes('offset=20')) {
                return {
                    json: async () => ({
                        items: [{ id: 22, source_word: 'n2', target_word: 'm2', created_at: '2026-02-18T00:00:00Z' }],
                        total: 25,
                    }),
                };
            }
            return {
                json: async () => ({
                    items: [{ id: 1, source_word: 'alpha', target_word: 'beta', created_at: '2026-02-18T00:00:00Z' }],
                    total: 25,
                }),
            };
        });

        const user = userEvent.setup();
        render(<ActiveDictionary />);

        await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
        await user.type(screen.getByPlaceholderText('Search source or target word...'), 'alp');
        await user.keyboard('{Enter}');
        await waitFor(() => {
            expect(authFetch.mock.calls.some(([url]) => url.includes('search=alp'))).toBe(true);
        });

        await user.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() => {
            expect(authFetch.mock.calls.some(([url]) => url.includes('offset=20'))).toBe(true);
        });
    });

    test('shows delete error when delete api fails', async () => {
        authFetch.mockImplementation(async (url, options = {}) => {
            if (options.method === 'DELETE') {
                return {
                    ok: false,
                    json: async () => ({ detail: 'Delete failed from backend' }),
                };
            }
            return {
                ok: true,
                json: async () => ({
                    items: [{ id: 9, source_word: 'a', target_word: 'b', created_at: '2026-02-18T00:00:00Z' }],
                    total: 1,
                }),
            };
        });

        const user = userEvent.setup();
        render(<ActiveDictionary />);

        await waitFor(() => expect(screen.getByText('b')).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: '刪除' }));
        await user.click(screen.getByRole('button', { name: 'confirm-delete' }));

        await waitFor(() => {
            expect(screen.getByText('Delete failed from backend')).toBeInTheDocument();
        });
    });
});
