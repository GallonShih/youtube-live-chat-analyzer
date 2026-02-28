import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import IncenseMapPage from './IncenseMapPage';
import { fetchIncenseCandidates } from '../../api/incenseMap';

vi.mock('../../api/incenseMap', () => ({
    fetchIncenseCandidates: vi.fn(),
}));

const MOCK_DATA = {
    total_matched: 6,
    unique_candidates: 3,
    candidates: [
        { word: '台中', count: 3, percentage: 50.0 },
        { word: '高雄', count: 2, percentage: 33.33 },
        { word: '台北', count: 1, percentage: 16.67 },
    ],
};

describe('IncenseMapPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('shows loading state initially', () => {
        fetchIncenseCandidates.mockReturnValue(new Promise(() => {}));
        render(<IncenseMapPage />);
        expect(screen.getByText('載入中...')).toBeInTheDocument();
    });

    test('shows error message when API fails', async () => {
        fetchIncenseCandidates.mockRejectedValue(new Error('API error: 500'));
        render(<IncenseMapPage />);
        await waitFor(() =>
            expect(screen.getByText(/錯誤：API error: 500/)).toBeInTheDocument()
        );
    });

    test('renders summary stats after load', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() =>
            expect(screen.getByText(/6 則上香訊息/)).toBeInTheDocument()
        );
        expect(screen.getByText(/3 個候選詞/)).toBeInTheDocument();
    });

    test('renders all candidates in table', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
    });

    test('filters rows by search input', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '高雄');

        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.queryByText('台中')).not.toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
    });

    test('shows no result message when search has no match', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '不存在的詞');

        expect(screen.getByText('找不到符合的詞彙')).toBeInTheDocument();
    });

    test('sorts by count ascending when count header clicked twice', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        const countHeader = screen.getByRole('columnheader', { name: /次數/ });

        // Default is count desc — click once → asc
        await user.click(countHeader);

        const rows = screen.getAllByRole('row').slice(1); // skip header
        expect(rows[0]).toHaveTextContent('台北');
        expect(rows[2]).toHaveTextContent('台中');
    });

    test('sorts by word when word header clicked', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('columnheader', { name: /詞彙/ }));

        const rows = screen.getAllByRole('row').slice(1);
        // localeCompare descending: 高雄 > 台北 > 台中
        expect(rows[0]).toHaveTextContent('高雄');
    });

    test('calls API with start_time on apply', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        const [startInput] = screen.getAllByDisplayValue('');
        await user.type(startInput, '2026-01-12T10:00');
        await user.click(screen.getByRole('button', { name: '套用' }));

        await waitFor(() =>
            expect(fetchIncenseCandidates).toHaveBeenLastCalledWith(
                expect.objectContaining({ startTime: '2026-01-12T10:00' })
            )
        );
    });

    test('clears filters and reloads on 全部 button click', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '全部' }));

        await waitFor(() =>
            expect(fetchIncenseCandidates).toHaveBeenLastCalledWith(
                expect.objectContaining({ startTime: undefined, endTime: undefined })
            )
        );
    });

    test('download button triggers file download with word list', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);

        const mockUrl = 'blob:mock-url';
        global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
        global.URL.revokeObjectURL = vi.fn();

        const mockClick = vi.fn();
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag, ...args) => {
            if (tag === 'a') return { href: '', download: '', click: mockClick };
            return originalCreateElement(tag, ...args);
        });

        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: /下載/ }));

        expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(mockClick).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

        vi.restoreAllMocks();
    });

    test('download button is disabled when list is empty', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 搜尋無結果 → sorted 為空 → 按鈕 disabled
        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '不存在');
        expect(screen.getByRole('button', { name: /下載/ })).toBeDisabled();
    });

    test('renders rank numbers in first column', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 第一欄有 #1 #2 #3，用 getAllByText 確認至少各有一個
        expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);

        // 確認表格 rows 數量符合資料筆數
        const rows = screen.getAllByRole('row');
        expect(rows).toHaveLength(4); // 1 header + 3 data rows
    });
});
