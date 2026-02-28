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

    // ── Mapping 功能 ──────────────────────────────────────────────────────

    const uploadMapping = async (user, json) => {
        const file = new File([JSON.stringify(json)], 'mapping.json', { type: 'application/json' });
        const input = document.querySelector('input[type="file"]');
        await user.upload(input, file);
    };

    test('shows upload button', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '上傳 Mapping JSON' })).toBeInTheDocument();
    });

    test('applies mapping and merges counts', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 高雄 (2) + 台北 (1) → 南部 (3)
        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });

        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());
        expect(screen.queryByText('高雄')).not.toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
        // 南部 count = 3，與台中 count = 3 並列
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2); // 台中 + 南部
    });

    test('recalculates percentage after mapping', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 高雄 (2) + 台北 (1) → 南部 (3)；台中 (3)；total = 6
        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });

        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());
        // 台中: 3/6 = 50%, 南部: 3/6 = 50%
        const percentages = screen.getAllByText('50%');
        expect(percentages.length).toBe(2);
    });

    test('shows filename and clear button after upload', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部' });

        await waitFor(() => expect(screen.getByText('mapping.json')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '清除 mapping' })).toBeInTheDocument();
        expect(screen.getByText(/已套用 mapping/)).toBeInTheDocument();
    });

    test('clears mapping and restores original data', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });
        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '清除 mapping' }));

        await waitFor(() => expect(screen.getByText('高雄')).toBeInTheDocument());
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.queryByText('南部')).not.toBeInTheDocument();
        expect(screen.queryByText(/已套用 mapping/)).not.toBeInTheDocument();
    });

    test('shows error for invalid JSON file', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        const badFile = new File(['not json {{'], 'bad.json', { type: 'application/json' });
        const input = document.querySelector('input[type="file"]');
        await user.upload(input, badFile);

        await waitFor(() =>
            expect(screen.getByText(/JSON \u683c\u5f0f\u932f\u8aa4|Unexpected token|JSON Parse error/i)).toBeInTheDocument()
        );
    });

    test('unmapped words keep original key', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        render(<IncenseMapPage />);
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 只 map 台北，高雄和台中應保持原名
        await uploadMapping(user, { 台北: '北部' });

        await waitFor(() => expect(screen.getByText('北部')).toBeInTheDocument());
        expect(screen.getByText('台中')).toBeInTheDocument();
        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
    });
});
