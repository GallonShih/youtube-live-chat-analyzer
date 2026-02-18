import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
    test('renders nothing when closed', () => {
        const { container } = render(
            <ConfirmModal
                isOpen={false}
                title="T"
                message="M"
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    test('supports confirm/cancel/backdrop/escape interactions', async () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        const user = userEvent.setup();

        render(
            <ConfirmModal
                isOpen
                title="刪除"
                message="確定嗎"
                onConfirm={onConfirm}
                onCancel={onCancel}
                confirmText="確認"
                cancelText="取消"
                isDestructive
            />,
        );

        const cancelBtn = screen.getByRole('button', { name: '取消' });
        expect(cancelBtn).toHaveFocus();

        await user.click(screen.getByRole('button', { name: '確認' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);

        await user.keyboard('{Escape}');
        expect(onCancel).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('dialog'));
        expect(onCancel).toHaveBeenCalledTimes(2);
    });

    test('can render via portal', () => {
        render(
            <ConfirmModal
                isOpen
                title="Portal"
                message="body"
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
                usePortal
            />,
        );
        expect(screen.getByText('Portal')).toBeInTheDocument();
    });
});

