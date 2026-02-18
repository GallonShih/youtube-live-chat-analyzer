import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AddReplaceWordForm from './AddReplaceWordForm';
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

vi.mock('./ValidationResultModal', () => ({
    default: ({ isOpen, isValid, conflicts = [] }) =>
        isOpen ? (
            <div data-testid="validation-modal">
                <span>{isValid ? 'VALID' : 'INVALID'}</span>
                {conflicts.map((c, i) => <span key={`c-${i}`}>{c.message}</span>)}
            </div>
        ) : null,
}));

describe('AddReplaceWordForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('shows validation result when backend validation fails', async () => {
        authFetch.mockResolvedValueOnce({
            json: async () => ({ valid: false, conflicts: [{ message: 'conflict exists' }] }),
        });
        const user = userEvent.setup();
        render(<AddReplaceWordForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

        await user.type(screen.getByLabelText('Source Word *'), 'cat');
        await user.type(screen.getByLabelText('Target Word *'), 'dog');
        await user.click(screen.getByRole('button', { name: '檢查' }));
        expect(screen.getByText('conflict exists')).toBeInTheDocument();
    });

    test('shows whitespace error and keeps validate button disabled', async () => {
        const user = userEvent.setup();
        render(<AddReplaceWordForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

        await user.type(screen.getByLabelText('Source Word *'), ' a');
        await user.type(screen.getByLabelText('Target Word *'), 'b ');

        expect(screen.getAllByText('前後不可包含空白').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: '檢查' })).toBeDisabled();
    });

    test('validates then submit failure triggers toast error', async () => {
        authFetch
            .mockResolvedValueOnce({
                json: async () => ({ valid: true, conflicts: [] }),
            })
            .mockResolvedValueOnce({
                json: async () => ({ success: false, message: 'bad request' }),
            });
        const user = userEvent.setup();

        render(<AddReplaceWordForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
        await user.type(screen.getByLabelText('Source Word *'), 'cat');
        await user.type(screen.getByLabelText('Target Word *'), 'dog');
        await user.click(screen.getByRole('button', { name: '檢查' }));
        await user.click(screen.getByRole('button', { name: '新增' }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith('新增失敗: bad request');
        });
    });
});
