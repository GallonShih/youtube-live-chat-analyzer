import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import ValidationResultModal from './ValidationResultModal';

describe('ValidationResultModal', () => {
    test('renders success view with warnings', () => {
        render(
            <ValidationResultModal
                isOpen
                isValid
                conflicts={[]}
                warnings={[{ type: 'warn', message: 'careful' }]}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText('驗證通過')).toBeInTheDocument();
        expect(screen.getByText('warn:')).toBeInTheDocument();
        expect(screen.getByText('careful')).toBeInTheDocument();
    });

    test('renders failure view and closes on escape/backdrop', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();

        render(
            <ValidationResultModal
                isOpen
                isValid={false}
                conflicts={[{ type: 'error', message: 'conflict' }]}
                warnings={[]}
                onClose={onClose}
            />,
        );

        expect(screen.getByText('驗證失敗')).toBeInTheDocument();
        expect(screen.getByText('conflict')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('dialog'));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    test('shows fallback message when conflicts are empty', () => {
        render(
            <ValidationResultModal
                isOpen
                isValid={false}
                conflicts={[]}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByText('未提供詳細資訊')).toBeInTheDocument();
    });
});

