import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ReplacementWordlistPanel from './ReplacementWordlistPanel';
import { useReplacementWordlists } from '../../hooks/useReplacementWordlists';

const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
};

vi.mock('../../components/common/Toast', () => ({
    useToast: () => toast,
}));

vi.mock('../../hooks/useReplacementWordlists', () => ({
    useReplacementWordlists: vi.fn(),
}));

vi.mock('../admin/ConfirmModal', () => ({
    default: ({ isOpen, onConfirm, onCancel }) =>
        isOpen ? (
            <div data-testid="confirm-modal">
                <button onClick={onConfirm}>confirm</button>
                <button onClick={onCancel}>cancel</button>
            </div>
        ) : null,
}));

describe('ReplacementWordlistPanel', () => {
    const saveWordlist = vi.fn();
    const updateWordlist = vi.fn();
    const removeWordlist = vi.fn();
    const onSelect = vi.fn();
    const onUpdate = vi.fn();
    const onRulesChange = vi.fn();
    const onSourceChange = vi.fn();
    const onTargetChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useReplacementWordlists.mockReturnValue({
            savedWordlists: [{ id: 1, name: 'R1' }],
            loading: false,
            saveWordlist,
            updateWordlist,
            removeWordlist,
        });
        saveWordlist.mockResolvedValue({ id: 88 });
        updateWordlist.mockResolvedValue({});
        removeWordlist.mockResolvedValue({});
    });

    test('adds and removes rules with confirmation', async () => {
        const user = userEvent.setup();
        render(
            <ReplacementWordlistPanel
                selectedId={1}
                onSelect={onSelect}
                onUpdate={onUpdate}
                rules={[{ source: 'a', target: 'b' }]}
                onRulesChange={onRulesChange}
                source="cat"
                onSourceChange={onSourceChange}
                target="dog"
                onTargetChange={onTargetChange}
                isAdmin
            />,
        );

        await user.click(screen.getByRole('button', { name: '新增取代規則' }));
        expect(onRulesChange).toHaveBeenCalledWith([
            { source: 'a', target: 'b' },
            { source: 'cat', target: 'dog' },
        ]);
        expect(onSourceChange).toHaveBeenCalledWith('');
        expect(onTargetChange).toHaveBeenCalledWith('');

        await user.click(screen.getByRole('button', { name: '移除 a 到 b 的規則' }));
        await user.click(screen.getByText('confirm'));
        expect(onRulesChange).toHaveBeenCalledWith([]);
    });

    test('updates, creates and deletes wordlists', async () => {
        const user = userEvent.setup();
        render(
            <ReplacementWordlistPanel
                selectedId={1}
                onSelect={onSelect}
                onUpdate={onUpdate}
                rules={[{ source: 'x', target: 'y' }]}
                onRulesChange={onRulesChange}
                source=""
                onSourceChange={onSourceChange}
                target=""
                onTargetChange={onTargetChange}
                isAdmin
            />,
        );

        await user.click(screen.getByRole('button', { name: '更新' }));
        await waitFor(() => expect(updateWordlist).toHaveBeenCalledWith(1, [{ source: 'x', target: 'y' }]));

        await user.click(screen.getByRole('button', { name: '另存' }));
        await user.click(screen.getByRole('button', { name: '建立' }));
        expect(screen.getByText('請輸入名稱')).toBeInTheDocument();
        await user.type(screen.getByLabelText('清單名稱'), 'NewList');
        await user.click(screen.getByRole('button', { name: '建立' }));
        await waitFor(() => expect(saveWordlist).toHaveBeenCalledWith('NewList', [{ source: 'x', target: 'y' }]));

        await user.click(screen.getByRole('button', { name: '刪除' }));
        await user.click(screen.getByText('confirm'));
        await waitFor(() => expect(removeWordlist).toHaveBeenCalledWith(1));
        expect(toast.success).toHaveBeenCalledWith('取代清單已刪除');
    });
});
