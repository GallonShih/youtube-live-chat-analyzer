import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AddSpecialWordForm from './AddSpecialWordForm';
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
    default: ({ isOpen, isValid, conflicts = [], warnings = [] }) =>
        isOpen ? (
            <div data-testid="validation-modal">
                <span>{isValid ? 'VALID' : 'INVALID'}</span>
                {conflicts.map((c, i) => <span key={`c-${i}`}>{c.message}</span>)}
                {warnings.map((w, i) => <span key={`w-${i}`}>{w.message}</span>)}
            </div>
        ) : null,
}));

describe('AddSpecialWordForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('shows whitespace error when input has leading/trailing spaces', async () => {
        const user = userEvent.setup();
        render(<AddSpecialWordForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

        await user.type(screen.getByLabelText('Word *'), ' a');
        expect(screen.getByText('前後不可包含空白')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '檢查' })).toBeDisabled();
    });

    test('validates then submits successfully', async () => {
        authFetch
            .mockResolvedValueOnce({
                json: async () => ({ valid: true, conflicts: [], warnings: [] }),
            })
            .mockResolvedValueOnce({
                json: async () => ({ success: true }),
            });
        const onSuccess = vi.fn();
        const user = userEvent.setup();

        render(<AddSpecialWordForm onSuccess={onSuccess} onCancel={vi.fn()} />);
        await user.type(screen.getByLabelText('Word *'), 'hello');
        await user.click(screen.getByRole('button', { name: '檢查' }));
        await user.click(screen.getByRole('button', { name: '新增' }));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(toast.success).toHaveBeenCalledWith('詞彙新增成功！');
        expect(authFetch).toHaveBeenCalledTimes(2);
    });

    test('blocks submit when not validated', () => {
        render(<AddSpecialWordForm onSuccess={vi.fn()} onCancel={vi.fn()} />);
        fireEvent.submit(screen.getByLabelText('新增特殊詞彙表單'));
        expect(toast.warning).toHaveBeenCalledWith('請先驗證詞彙是否符合標準');
    });
});
