import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import WordCloudPanel from './WordCloudPanel';
import { useWordFrequency } from '../../hooks/useWordFrequency';
import { useWordlists } from '../../hooks/useWordlists';
import { useReplacementWordlists } from '../../hooks/useReplacementWordlists';

const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
};

vi.mock('react-d3-cloud', () => ({
    default: () => <div data-testid="wordcloud-canvas" />,
}));

vi.mock('../../components/common/Spinner', () => ({
    LoadingOverlay: ({ message }) => <div>{message}</div>,
}));

vi.mock('../../components/common/Toast', () => ({
    useToast: () => toast,
}));

vi.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({ isAdmin: true }),
}));

vi.mock('../../hooks/useWordFrequency', () => ({
    useWordFrequency: vi.fn(),
}));

vi.mock('../../hooks/useWordlists', () => ({
    useWordlists: vi.fn(),
}));

vi.mock('../../hooks/useReplacementWordlists', () => ({
    useReplacementWordlists: vi.fn(),
}));

vi.mock('./ReplacementWordlistPanel', () => ({
    default: () => <div data-testid="replacement-panel" />,
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

describe('WordCloudPanel', () => {
    const getWordFrequency = vi.fn();
    const getWordlist = vi.fn();
    const saveWordlist = vi.fn();
    const updateWordlist = vi.fn();
    const removeWordlist = vi.fn();
    const getReplacementWordlist = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        useWordFrequency.mockReturnValue({
            wordData: [{ text: 'hello', value: 10 }, { text: 'world', value: 5 }],
            stats: { total_messages: 100, unique_words: 20 },
            loading: false,
            error: null,
            getWordFrequency,
        });
        useWordlists.mockReturnValue({
            savedWordlists: [{ id: 1, name: 'WL1' }],
            refreshWordlists: vi.fn(),
            saveWordlist,
            updateWordlist,
            removeWordlist,
            getWordlist,
        });
        useReplacementWordlists.mockReturnValue({
            getWordlist: getReplacementWordlist,
        });
        getWordlist.mockResolvedValue({ words: ['aaa', 'bbb'] });
        saveWordlist.mockResolvedValue({ id: 99 });
        updateWordlist.mockResolvedValue({});
        removeWordlist.mockResolvedValue({});
        getReplacementWordlist.mockResolvedValue({ replacements: [{ source: 'a', target: 'b' }] });
    });

    test('loads frequency and manages exclusion words', async () => {
        const user = userEvent.setup();
        render(<WordCloudPanel startTime="2026-02-18T00:00:00Z" endTime="2026-02-18T01:00:00Z" hasTimeFilter />);

        await waitFor(() => expect(getWordFrequency).toHaveBeenCalled());
        expect(screen.getByTestId('wordcloud-canvas')).toBeInTheDocument();
        expect(screen.getByText(/總訊息:/)).toBeInTheDocument();

        // Add exclusion word
        await user.type(screen.getByLabelText('新增排除詞彙'), 'neww');
        await user.click(screen.getByRole('button', { name: '新增詞彙' }));
        expect(screen.getByText('neww')).toBeInTheDocument();

        // Remove via confirm modal
        await user.click(screen.getByRole('button', { name: '移除 neww' }));
        await user.click(screen.getByText('confirm'));
        await waitFor(() => expect(screen.queryByText('neww')).not.toBeInTheDocument());
    });

    test('supports wordlist load/save/update/delete flow', async () => {
        const user = userEvent.setup();
        render(<WordCloudPanel startTime={null} endTime={null} hasTimeFilter={false} />);

        await user.selectOptions(screen.getByDisplayValue('無'), '1');
        await waitFor(() => expect(getWordlist).toHaveBeenCalledWith(1));
        expect(screen.getByText('aaa')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '更新' }));
        await waitFor(() => expect(updateWordlist).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: '另存' }));
        await user.click(screen.getByRole('button', { name: '儲存' }));
        expect(screen.getByText('請輸入名稱')).toBeInTheDocument();
        await user.type(screen.getByLabelText('清單名稱'), 'MyList');
        await user.click(screen.getByRole('button', { name: '儲存' }));
        await waitFor(() => expect(saveWordlist).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: '刪除' }));
        await user.click(screen.getByText('confirm'));
        await waitFor(() => expect(removeWordlist).toHaveBeenCalledWith(99));
        expect(toast.success).toHaveBeenCalledWith('排除清單已刪除');
    });

    test('switches to replacement tab and opens replacement panel', async () => {
        const user = userEvent.setup();
        render(<WordCloudPanel startTime={null} endTime={null} hasTimeFilter={false} />);

        await user.click(screen.getByRole('button', { name: '取代規則' }));
        expect(screen.getByTestId('replacement-panel')).toBeInTheDocument();
    });
});
