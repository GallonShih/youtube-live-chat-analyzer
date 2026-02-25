import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import WordGroupCard from './WordGroupCard';

describe('WordGroupCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    test('renders group and supports visibility toggle/edit/delete for admin', async () => {
        const onToggleVisibility = vi.fn();
        const onDelete = vi.fn().mockResolvedValue({});
        const user = userEvent.setup();

        render(
            <WordGroupCard
                group={{ id: 1, name: 'Group1', words: ['a', 'b'], color: '#5470C6' }}
                isVisible
                onToggleVisibility={onToggleVisibility}
                onDelete={onDelete}
                isAdmin
            />,
        );

        expect(screen.getByText('Group1')).toBeInTheDocument();
        await user.click(screen.getByLabelText('隱藏圖表'));
        expect(onToggleVisibility).toHaveBeenCalledWith(1);

        await user.click(screen.getByLabelText('刪除詞彙組'));
        await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
    });

    test('validates and saves edited group data', async () => {
        const onSave = vi.fn().mockResolvedValue({});
        const user = userEvent.setup();

        render(
            <WordGroupCard
                group={{ id: 2, name: 'Old', words: ['x'], color: '#5470C6' }}
                onSave={onSave}
                isAdmin
            />,
        );

        await user.click(screen.getByLabelText('編輯詞彙組'));

        const nameInput = screen.getByDisplayValue('Old');
        await user.clear(nameInput);
        await user.type(nameInput, 'NewName');
        await user.type(screen.getByPlaceholderText('新增詞彙...'), 'y');
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('button', { name: '儲存' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 2,
                    name: 'NewName',
                    words: ['x', 'y'],
                    color: '#5470C6',
                })
            );
        });
    });

    test('shows validation message when saving empty group', async () => {
        const onSave = vi.fn();
        const user = userEvent.setup();

        render(<WordGroupCard isNew onSave={onSave} onCancel={vi.fn()} isAdmin />);
        await user.click(screen.getByRole('button', { name: '儲存' }));

        expect(screen.getByText('請輸入詞彙組名稱')).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    test('shows exclude words section in edit mode and hides in view mode', async () => {
        const user = userEvent.setup();

        render(
            <WordGroupCard
                group={{ id: 1, name: 'G', words: ['吉祥'], exclude_words: ['吉祥天'], color: '#5470C6' }}
                isAdmin
                isVisible
                onToggleVisibility={vi.fn()}
                onDelete={vi.fn()}
                onSave={vi.fn()}
            />,
        );

        // View mode: exclude word NOT visible
        expect(screen.queryByText('吉祥天')).not.toBeInTheDocument();

        // Enter edit mode
        await user.click(screen.getByLabelText('編輯詞彙組'));

        // Edit mode: exclude word visible
        expect(screen.getByText('吉祥天')).toBeInTheDocument();
    });

    test('can add exclude word and it appears in onSave payload', async () => {
        const onSave = vi.fn().mockResolvedValue({});
        const user = userEvent.setup();

        render(
            <WordGroupCard
                group={{ id: 2, name: 'G2', words: ['w'], exclude_words: [], color: '#5470C6' }}
                isAdmin
                onSave={onSave}
            />,
        );

        await user.click(screen.getByLabelText('編輯詞彙組'));

        await user.type(screen.getByPlaceholderText('新增排除詞...'), '吉祥物');
        await user.keyboard('{Enter}');

        await user.click(screen.getByRole('button', { name: '儲存' }));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({ exclude_words: ['吉祥物'] })
            );
        });
    });

    test('exclude word can be removed with × button', async () => {
        const user = userEvent.setup();

        render(
            <WordGroupCard
                group={{ id: 3, name: 'G3', words: ['w'], exclude_words: ['bad'], color: '#5470C6' }}
                isAdmin
                onSave={vi.fn().mockResolvedValue({})}
            />,
        );

        await user.click(screen.getByLabelText('編輯詞彙組'));
        expect(screen.getByText('bad')).toBeInTheDocument();

        const badTag = screen.getByText('bad').closest('span');
        await user.click(badTag.querySelector('button'));

        expect(screen.queryByText('bad')).not.toBeInTheDocument();
    });
});
