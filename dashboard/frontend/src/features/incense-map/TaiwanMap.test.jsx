import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import TaiwanMap from './TaiwanMap';
import useTaiwanMap from './useTaiwanMap';
import useWorldCountries from './useWorldCountries';

// 模擬 22 個行政區 features（簡化版幾何，足以測試邏輯）
const makeMockFeature = (name) => ({
    type: 'Feature',
    properties: { COUNTYNAME: name },
    geometry: {
        type: 'Polygon',
        coordinates: [[[121, 25], [121.1, 25], [121.1, 25.1], [121, 25.1], [121, 25]]],
    },
});

const ALL_REGIONS = [
    '台北', '新北', '桃園', '台中', '台南', '高雄',
    '基隆', '新竹', '嘉義', '宜蘭', '苗栗',
    '彰化', '南投', '雲林', '屏東', '花蓮', '台東',
    '澎湖', '金門', '連江',
];

const MOCK_FEATURES = ALL_REGIONS.map(makeMockFeature);

// Mock useTaiwanMap hook to avoid network calls
vi.mock('./useTaiwanMap', () => ({
    default: vi.fn(() => ({
        features: [],
        loading: false,
        error: null,
    })),
    REGION_NAMES: new Set([
        '台北', '新北', '桃園', '台中', '台南', '高雄',
        '基隆', '新竹', '嘉義', '宜蘭', '苗栗',
        '彰化', '南投', '雲林', '屏東', '花蓮', '台東',
        '澎湖', '金門', '連江',
    ]),
    cleanName: (name) => name.replace(/[縣市]$|縣市$/, ''),
    processTopology: vi.fn(),
}));

// Mock useWorldCountries hook
vi.mock('./useWorldCountries', () => ({
    default: vi.fn(() => ({
        countryFeatures: [],
        loading: false,
        error: null,
    })),
    COUNTRY_NAME_MAP: {},
    COUNTRY_OPTIONS: [],
}));

const REGION_DATA = {
    台北: { count: 100, percentage: 50.0 },
    高雄: { count: 60, percentage: 30.0 },
    台中: { count: 40, percentage: 20.0 },
};

describe('TaiwanMap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-set default mock return value
        useTaiwanMap.mockReturnValue({
            features: MOCK_FEATURES,
            loading: false,
            error: null,
        });
    });

    test('renders an SVG element', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    test('renders a path for each Taiwan region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const paths = document.querySelectorAll('path[data-region]');
        // Main map: 18 regions (20 total - 金門 - 連江) + 2 inset paths = 20
        expect(paths.length).toBe(20);
    });

    test('matched regions have correct data-count', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        expect(taipei).toBeInTheDocument();
        expect(Number(taipei.getAttribute('data-count'))).toBe(100);
    });

    test('unmatched regions have data-count 0', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const nantou = document.querySelector('[data-region="南投"]');
        expect(nantou).toBeInTheDocument();
        expect(Number(nantou.getAttribute('data-count'))).toBe(0);
    });

    test('shows match summary text', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(screen.getByText(/3 個地區有資料/)).toBeInTheDocument();
    });

    test('shows tooltip on mouse move over a region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        fireEvent.mouseMove(taipei, { clientX: 100, clientY: 200 });
        expect(screen.getByTestId('map-tooltip')).toBeInTheDocument();
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.getByText(/100 次/)).toBeInTheDocument();
        expect(screen.getByText(/50%/)).toBeInTheDocument();
    });

    test('hides tooltip on mouse leave', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        fireEvent.mouseMove(taipei, { clientX: 100, clientY: 200 });
        expect(screen.getByTestId('map-tooltip')).toBeInTheDocument();
        fireEvent.mouseLeave(taipei);
        expect(screen.queryByTestId('map-tooltip')).not.toBeInTheDocument();
    });

    test('shows 無資料 in tooltip for unmatched region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const nantou = document.querySelector('[data-region="南投"]');
        fireEvent.mouseMove(nantou, { clientX: 100, clientY: 200 });
        expect(screen.getByText('南投')).toBeInTheDocument();
        expect(screen.getByText('無資料')).toBeInTheDocument();
    });

    test('renders with empty regionData', () => {
        render(<TaiwanMap regionData={{}} />);
        const paths = document.querySelectorAll('path[data-region]');
        expect(paths.length).toBe(20);
        expect(screen.getByText(/0 個地區有資料/)).toBeInTheDocument();
    });

    test('renders inset maps for 連江 and 金門', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(screen.getByTestId('inset-連江')).toBeInTheDocument();
        expect(screen.getByTestId('inset-金門')).toBeInTheDocument();
        expect(screen.getByText('連江 (馬祖)')).toBeInTheDocument();
        expect(screen.getByText('金門')).toBeInTheDocument();
    });

    test('shows loading state while features load', () => {
        useTaiwanMap.mockReturnValue({
            features: [],
            loading: true,
            error: null,
        });
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(screen.getByTestId('map-loading')).toBeInTheDocument();
        expect(screen.getByText(/載入地圖中/)).toBeInTheDocument();
    });

    test('shows error state when loading fails', () => {
        useTaiwanMap.mockReturnValue({
            features: [],
            loading: false,
            error: 'HTTP 500',
        });
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(screen.getByTestId('map-error')).toBeInTheDocument();
        expect(screen.getByText(/地圖載入失敗/)).toBeInTheDocument();
    });

    test('renders country insets when countries prop is provided', () => {
        const MOCK_JP_FEATURE = {
            type: 'Feature',
            id: '392',
            properties: { name: 'Japan' },
            geometry: { type: 'Polygon', coordinates: [[[130, 30], [145, 30], [145, 45], [130, 45], [130, 30]]] },
        };
        useWorldCountries.mockReturnValue({
            countryFeatures: [{ name: '日本', feature: MOCK_JP_FEATURE }],
            loading: false,
            error: null,
        });
        render(<TaiwanMap regionData={REGION_DATA} countries={[{ name: '日本' }]} />);
        expect(screen.getByTestId('country-日本')).toBeInTheDocument();
        expect(screen.getByText('日本')).toBeInTheDocument();
    });

    test('country inset shows tooltip on mouse move', () => {
        const MOCK_KR_FEATURE = {
            type: 'Feature',
            id: '410',
            properties: { name: 'South Korea' },
            geometry: { type: 'Polygon', coordinates: [[[126, 33], [130, 33], [130, 38], [126, 38], [126, 33]]] },
        };
        useWorldCountries.mockReturnValue({
            countryFeatures: [{ name: '韓國', feature: MOCK_KR_FEATURE }],
            loading: false,
            error: null,
        });
        const regionDataWithCountry = { ...REGION_DATA, 韓國: { count: 25, percentage: 12.5 } };
        render(<TaiwanMap regionData={regionDataWithCountry} countries={[{ name: '韓國' }]} />);
        const countryInset = screen.getByTestId('country-韓國');
        fireEvent.mouseMove(countryInset, { clientX: 300, clientY: 100 });
        expect(screen.getByTestId('map-tooltip')).toBeInTheDocument();
        // '韓國' appears in both inset label and tooltip
        expect(screen.getAllByText('韓國').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText(/25 次/)).toBeInTheDocument();
    });
});
