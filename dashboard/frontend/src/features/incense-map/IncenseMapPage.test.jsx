import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import IncenseMapPage from './IncenseMapPage';
import { fetchIncenseCandidates } from '../../api/incenseMap';
import { AuthProvider } from '../../contexts/AuthContext';

const renderPage = () => render(
    <AuthProvider>
        <MemoryRouter>
            <IncenseMapPage />
        </MemoryRouter>
    </AuthProvider>
);

vi.mock('../../api/incenseMap', () => ({
    fetchIncenseCandidates: vi.fn(),
}));

// Mock TaiwanMap to avoid d3/network issues in page-level tests
vi.mock('./TaiwanMap', () => ({
    default: ({ regionData, countries }) => (
        <div data-testid="taiwan-map">
            {Object.entries(regionData).map(([name, d]) => (
                <span key={name} data-region={name} data-count={d.count} />
            ))}
            {(countries || []).map((c) => (
                <span key={c.name} data-testid={`map-country-${c.name}`} />
            ))}
        </div>
    ),
}));

// Mock useWorldCountries to avoid network calls
vi.mock('./useWorldCountries', () => ({
    default: vi.fn(() => ({ countryFeatures: [], loading: false, error: null })),
    COUNTRY_NAME_MAP: {
        日本: { code: '392', en: 'Japan' },
        韓國: { code: '410', en: 'South Korea' },
        美國: { code: '840', en: 'United States of America' },
    },
    COUNTRY_OPTIONS: ['日本', '美國', '韓國'],
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
        renderPage();
        expect(screen.getByText('載入中...')).toBeInTheDocument();
    });

    test('shows error message when API fails', async () => {
        fetchIncenseCandidates.mockRejectedValue(new Error('API error: 500'));
        renderPage();
        await waitFor(() =>
            expect(screen.getByText(/資料載入失敗：API error: 500/)).toBeInTheDocument()
        );
        // 即使 API 失敗，仍應顯示 tab 切換
        expect(screen.getByRole('button', { name: '地圖' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '表格' })).toBeInTheDocument();
        // 應有重試按鈕
        expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
    });

    test('renders summary stats after load', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() =>
            expect(screen.getByText(/6 則上香訊息/)).toBeInTheDocument()
        );
        expect(screen.getByText(/3 個候選詞/)).toBeInTheDocument();
    });

    test('renders all candidates in table', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.getByText('50%')).toBeInTheDocument();
    });

    test('filters rows by search input', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '高雄');

        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.queryByText('台中')).not.toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
    });

    test('shows no result message when search has no match', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '不存在的詞');

        expect(screen.getByText('找不到符合的詞彙')).toBeInTheDocument();
    });

    test('sorts by count ascending when count header clicked twice', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
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
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('columnheader', { name: /詞彙/ }));

        const rows = screen.getAllByRole('row').slice(1);
        // localeCompare descending: 高雄 > 台北 > 台中
        expect(rows[0]).toHaveTextContent('高雄');
    });

    test('calls API with start_time on apply', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
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
        renderPage();
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

        // Mock click on HTMLAnchorElement prototype so React's <a> elements are unaffected
        const mockClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: /下載/ }));

        expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(mockClick).toHaveBeenCalled();
        expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);

        mockClick.mockRestore();
    });

    test('download button is disabled when list is empty', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 搜尋無結果 → sorted 為空 → 按鈕 disabled
        await user.type(screen.getByPlaceholderText('搜尋詞彙...'), '不存在');
        expect(screen.getByRole('button', { name: /下載/ })).toBeDisabled();
    });

    test('renders rank numbers in first column', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
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

    const uploadMapping = async (user, json, filename = 'mapping.json') => {
        const file = new File([JSON.stringify(json)], filename, { type: 'application/json' });
        const input = document.querySelector('input[type="file"]');
        await user.upload(input, file);
    };

    test('shows upload button', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '+ 新增 Mapping JSON' })).toBeInTheDocument();
    });

    test('applies mapping and merges counts', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // 高雄 (2) + 台北 (1) → 南部 (3)
        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });

        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());
        expect(screen.queryByText('高雄')).not.toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2); // 台中 + 南部
    });

    test('recalculates percentage after mapping', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });

        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());
        // 台中: 3/6 = 50%, 南部: 3/6 = 50%
        expect(screen.getAllByText('50%')).toHaveLength(2);
    });

    test('shows filename and remove button after upload', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部' });

        await waitFor(() => expect(screen.getByText('mapping.json')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '移除 mapping 1' })).toBeInTheDocument();
        expect(screen.getByText(/已套用 1 層 mapping/)).toBeInTheDocument();
    });

    test('removes single mapping and restores original data', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });
        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '移除 mapping 1' }));

        await waitFor(() => expect(screen.getByText('高雄')).toBeInTheDocument());
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.queryByText('南部')).not.toBeInTheDocument();
        expect(screen.queryByText(/已套用/)).not.toBeInTheDocument();
    });

    test('applies two mappings sequentially', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        // Layer 1: 高雄+台北 → 南部
        await uploadMapping(user, { 高雄: '南部', 台北: '南部' }, 'layer1.json');
        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());

        // Layer 2: 台中+南部 → 全台
        await uploadMapping(user, { 台中: '全台', 南部: '全台' }, 'layer2.json');
        await waitFor(() => expect(screen.getByText('全台')).toBeInTheDocument());

        expect(screen.queryByText('台中')).not.toBeInTheDocument();
        expect(screen.queryByText('南部')).not.toBeInTheDocument();
        expect(screen.getByText(/已套用 2 層 mapping/)).toBeInTheDocument();
        // 全台 count = 6, 100%
        expect(screen.getByText('100%')).toBeInTheDocument();
    });

    test('shows clear-all button when 2+ mappings loaded', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部' }, 'a.json');
        await uploadMapping(user, { 台中: '中部' }, 'b.json');

        await waitFor(() => expect(screen.getByRole('button', { name: '清除所有 mapping' })).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '清除所有 mapping' }));
        await waitFor(() => expect(screen.queryByText(/已套用/)).not.toBeInTheDocument());
        expect(screen.getByText('高雄')).toBeInTheDocument();
    });

    test('shows error for invalid JSON file', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
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
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 台北: '北部' });

        await waitFor(() => expect(screen.getByText('北部')).toBeInTheDocument());
        expect(screen.getByText('台中')).toBeInTheDocument();
        expect(screen.getByText('高雄')).toBeInTheDocument();
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
    });

    // ── Tab 切換 ──────────────────────────────────────────────────────────

    test('renders tab switcher with 地圖 and 表格 tabs', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '地圖' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '表格' })).toBeInTheDocument();
    });

    test('default tab is 表格, shows table content', async () => {
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.queryByTestId('taiwan-map')).not.toBeInTheDocument();
    });

    test('clicking 地圖 tab shows TaiwanMap and hides table', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        expect(screen.getByTestId('taiwan-map')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('regionData passed to TaiwanMap contains matched candidates', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        const map = screen.getByTestId('taiwan-map');
        expect(map.querySelector('[data-region="台中"]')).toBeInTheDocument();
        expect(map.querySelector('[data-region="高雄"]')).toBeInTheDocument();
    });

    test('regionData respects applied mappings', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await uploadMapping(user, { 高雄: '南部', 台北: '南部' });
        await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        const map = screen.getByTestId('taiwan-map');
        expect(map.querySelector('[data-region="台中"]')).toBeInTheDocument();
        expect(map.querySelector('[data-region="南部"]')).not.toBeInTheDocument();
    });

    // ── 品牌管理 ─────────────────────────────────────────────────────────

    test('map tab shows default brand tags and add-brand button', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        expect(screen.getByText('逆水寒')).toBeInTheDocument();
        expect(screen.getByText('傳說對決')).toBeInTheDocument();
        expect(screen.getByText('格力變頻空調')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /新增品牌/ })).toBeInTheDocument();
        // Modal 預設不顯示
        expect(screen.queryByTestId('brand-modal')).not.toBeInTheDocument();
    });

    test('clicking 新增品牌 opens modal with input', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增品牌/ }));

        expect(screen.getByTestId('brand-modal')).toBeInTheDocument();
        expect(screen.getByLabelText('品牌名稱')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '確認新增' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    });

    test('can add a new brand via modal', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增品牌/ }));

        const input = screen.getByLabelText('品牌名稱');
        fireEvent.change(input, { target: { value: 'TestBrand' } });
        expect(screen.getByRole('button', { name: '確認新增' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: '確認新增' }));

        // Modal 關閉，品牌已新增
        await waitFor(() => expect(screen.queryByTestId('brand-modal')).not.toBeInTheDocument());
        expect(screen.getByText('TestBrand')).toBeInTheDocument();
    });

    test('modal shows error for duplicate brand', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增品牌/ }));

        const input = screen.getByLabelText('品牌名稱');
        fireEvent.change(input, { target: { value: '逆水寒' } });
        await user.click(screen.getByRole('button', { name: '確認新增' }));

        // Modal 仍開啟，顯示錯誤
        expect(screen.getByTestId('brand-modal')).toBeInTheDocument();
        expect(screen.getByText('此品牌已存在')).toBeInTheDocument();
    });

    test('modal can be closed via cancel button', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增品牌/ }));

        expect(screen.getByTestId('brand-modal')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '取消' }));

        expect(screen.queryByTestId('brand-modal')).not.toBeInTheDocument();
    });

    test('can remove a brand', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        expect(screen.getByText('逆水寒')).toBeInTheDocument();

        await user.click(screen.getByLabelText('移除品牌 逆水寒'));

        expect(screen.queryByText('逆水寒')).not.toBeInTheDocument();
    });

    // ── 國家管理 ─────────────────────────────────────────────────────────

    test('map tab shows add-country button', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        expect(screen.getByRole('button', { name: /新增國家/ })).toBeInTheDocument();
        expect(screen.queryByTestId('country-modal')).not.toBeInTheDocument();
    });

    test('clicking 新增國家 opens modal with select', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增國家/ }));

        expect(screen.getByTestId('country-modal')).toBeInTheDocument();
        expect(screen.getByLabelText('國家名稱')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '確認新增' })).toBeDisabled();
    });

    test('can add a country via modal', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增國家/ }));

        const select = screen.getByLabelText('國家名稱');
        fireEvent.change(select, { target: { value: '日本' } });

        await user.click(screen.getByRole('button', { name: '確認新增' }));

        await waitFor(() => expect(screen.queryByTestId('country-modal')).not.toBeInTheDocument());
        // 國家標籤出現在地圖 tab 中
        expect(screen.getByText('日本')).toBeInTheDocument();
    });

    test('country modal shows error for duplicate', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        // 先新增日本
        await user.click(screen.getByRole('button', { name: /新增國家/ }));
        fireEvent.change(screen.getByLabelText('國家名稱'), { target: { value: '日本' } });
        await user.click(screen.getByRole('button', { name: '確認新增' }));
        await waitFor(() => expect(screen.queryByTestId('country-modal')).not.toBeInTheDocument());

        // 再次新增日本
        await user.click(screen.getByRole('button', { name: /新增國家/ }));
        fireEvent.change(screen.getByLabelText('國家名稱'), { target: { value: '日本' } });
        await user.click(screen.getByRole('button', { name: '確認新增' }));

        expect(screen.getByTestId('country-modal')).toBeInTheDocument();
        expect(screen.getByText('此國家已存在')).toBeInTheDocument();
    });

    test('can remove a country', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        // 新增日本
        await user.click(screen.getByRole('button', { name: /新增國家/ }));
        fireEvent.change(screen.getByLabelText('國家名稱'), { target: { value: '日本' } });
        await user.click(screen.getByRole('button', { name: '確認新增' }));
        await waitFor(() => expect(screen.getByText('日本')).toBeInTheDocument());

        // 移除日本
        await user.click(screen.getByLabelText('移除國家 日本'));
        expect(screen.queryByText('日本')).not.toBeInTheDocument();
    });

    test('country modal can be closed via cancel', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));
        await user.click(screen.getByRole('button', { name: /新增國家/ }));
        expect(screen.getByTestId('country-modal')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: '取消' }));
        expect(screen.queryByTestId('country-modal')).not.toBeInTheDocument();
    });

    test('countries prop is passed to TaiwanMap', async () => {
        const user = userEvent.setup();
        fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
        renderPage();
        await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: '地圖' }));

        // 新增韓國
        await user.click(screen.getByRole('button', { name: /新增國家/ }));
        fireEvent.change(screen.getByLabelText('國家名稱'), { target: { value: '韓國' } });
        await user.click(screen.getByRole('button', { name: '確認新增' }));

        await waitFor(() => expect(screen.getByTestId('map-country-韓國')).toBeInTheDocument());
    });
});
