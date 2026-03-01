# Incense Map Taiwan Choropleth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Taiwan choropleth map to the Incense Map page, integrated with the existing mapping-JSON workflow, with tab switching between map view and table view.

**Architecture:** A new `TaiwanMap.jsx` component renders 22 Taiwan administrative districts as SVG paths using d3-geo projection + d3-zoom for pan/zoom. `IncenseMapPage` gains a tab switcher; `mappedCandidates` whose `word` matches a region name flow into `regionData` and color the map. Geo data is extracted from `docs/geo_data_extracted.json` and stored as a frontend static asset.

**Tech Stack:** React, d3 v7 (already installed: geoMercator, geoPath, zoom, scaleLinear, select), Vitest + Testing Library, Tailwind CSS

---

### Task 1: Extract Taiwan GeoJSON asset

**Files:**
- Create: `dashboard/frontend/src/assets/geo/taiwan_regions.json`

**Step 1: Generate the file**

Run from repo root:
```bash
python3 -c "
import json
with open('docs/geo_data_extracted.json') as f:
    data = json.load(f)
taiwan = [ft for ft in data['features'] if ft['properties']['type'] == 'taiwan_region']
out = {'type': 'FeatureCollection', 'features': taiwan}
with open('dashboard/frontend/src/assets/geo/taiwan_regions.json', 'w') as f:
    json.dump(out, f, ensure_ascii=False)
print(f'Wrote {len(taiwan)} features')
"
```

Expected output: `Wrote 22 features`

**Step 2: Verify**

```bash
python3 -c "
import json
with open('dashboard/frontend/src/assets/geo/taiwan_regions.json') as f:
    d = json.load(f)
print(len(d['features']), 'features')
print([ft['properties']['name'] for ft in d['features']])
"
```

Expected: 22 features, names include 台北, 高雄, 台南 etc.

**Step 3: Commit**

```bash
git add dashboard/frontend/src/assets/geo/taiwan_regions.json
git commit -m "feat(incense-map): add Taiwan regions GeoJSON asset"
```

---

### Task 2: Create TaiwanMap component (TDD)

**Files:**
- Create: `dashboard/frontend/src/features/incense-map/TaiwanMap.jsx`
- Create: `dashboard/frontend/src/features/incense-map/TaiwanMap.test.jsx`

**Step 1: Write the failing tests**

Create `dashboard/frontend/src/features/incense-map/TaiwanMap.test.jsx`:

```jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import TaiwanMap from './TaiwanMap';

// Mock d3 zoom/selection (not supported in jsdom)
vi.mock('d3', async (importOriginal) => {
    const actual = await importOriginal();
    const mockZoom = vi.fn(() => ({
        scaleExtent: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
    }));
    const mockSelect = vi.fn(() => ({
        call: vi.fn().mockReturnThis(),
        on: vi.fn().mockReturnThis(),
    }));
    return { ...actual, zoom: mockZoom, select: mockSelect };
});

const REGION_DATA = {
    台北: { count: 100, percentage: 50.0 },
    高雄: { count: 60, percentage: 30.0 },
    台中: { count: 40, percentage: 20.0 },
};

describe('TaiwanMap', () => {
    test('renders an SVG element', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(document.querySelector('svg')).toBeInTheDocument();
    });

    test('renders a path for each Taiwan region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        // 22 regions in the GeoJSON
        const paths = document.querySelectorAll('path[data-region]');
        expect(paths.length).toBe(22);
    });

    test('matched regions have data-count > 0', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        expect(taipei).toBeInTheDocument();
        expect(Number(taipei.getAttribute('data-count'))).toBe(100);
    });

    test('unmatched regions have data-count 0', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        // 南投 is not in REGION_DATA
        const nantou = document.querySelector('[data-region="南投"]');
        expect(nantou).toBeInTheDocument();
        expect(Number(nantou.getAttribute('data-count'))).toBe(0);
    });

    test('shows match summary text', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        // 3 matched, 19 unmatched
        expect(screen.getByText(/3 個地區有資料/)).toBeInTheDocument();
    });

    test('shows tooltip on mouse move over a region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        fireEvent.mouseMove(taipei, { clientX: 100, clientY: 200 });
        expect(screen.getByText('台北')).toBeInTheDocument();
        expect(screen.getByText(/100/)).toBeInTheDocument();
        expect(screen.getByText(/50/)).toBeInTheDocument();
    });

    test('hides tooltip on mouse leave', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const taipei = document.querySelector('[data-region="台北"]');
        fireEvent.mouseMove(taipei, { clientX: 100, clientY: 200 });
        expect(screen.getByText('台北')).toBeInTheDocument();
        fireEvent.mouseLeave(taipei);
        expect(screen.queryByText('台北')).not.toBeInTheDocument();
    });

    test('shows region name in tooltip for unmatched region', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        const nantou = document.querySelector('[data-region="南投"]');
        fireEvent.mouseMove(nantou, { clientX: 100, clientY: 200 });
        expect(screen.getByText('南投')).toBeInTheDocument();
        expect(screen.getByText('無資料')).toBeInTheDocument();
    });

    test('renders reset button', () => {
        render(<TaiwanMap regionData={REGION_DATA} />);
        expect(screen.getByRole('button', { name: /重置/ })).toBeInTheDocument();
    });

    test('renders with empty regionData', () => {
        render(<TaiwanMap regionData={{}} />);
        const paths = document.querySelectorAll('path[data-region]');
        expect(paths.length).toBe(22);
        expect(screen.getByText(/0 個地區有資料/)).toBeInTheDocument();
    });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd dashboard/frontend
npx vitest run src/features/incense-map/TaiwanMap.test.jsx --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `TaiwanMap` module not found.

**Step 3: Implement TaiwanMap.jsx**

Create `dashboard/frontend/src/features/incense-map/TaiwanMap.jsx`:

```jsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { geoMercator, geoPath, zoom, zoomIdentity, select, scaleLinear } from 'd3';
import taiwanGeo from '../../assets/geo/taiwan_regions.json';

const WIDTH = 500;
const HEIGHT = 620;

export default function TaiwanMap({ regionData }) {
    const svgRef = useRef(null);
    const [transform, setTransform] = useState(zoomIdentity);
    const [tooltip, setTooltip] = useState(null);

    const projection = useMemo(() =>
        geoMercator().fitSize([WIDTH, HEIGHT], taiwanGeo)
    , []);

    const pathGen = useMemo(() => geoPath(projection), [projection]);

    const maxCount = useMemo(() =>
        Math.max(0, ...Object.values(regionData).map(d => d.count))
    , [regionData]);

    const colorScale = useMemo(() =>
        scaleLinear().domain([0, Math.max(1, maxCount)]).range(['#c7d2fe', '#3730a3'])
    , [maxCount]);

    useEffect(() => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const z = zoom()
            .scaleExtent([0.5, 8])
            .on('zoom', (event) => setTransform(event.transform));
        select(svgEl).call(z);
        return () => select(svgEl).on('.zoom', null);
    }, []);

    const handleReset = () => {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        select(svgEl).call(
            zoom().transform,
            zoomIdentity
        );
        setTransform(zoomIdentity);
    };

    const features = taiwanGeo.features;
    const matchedCount = features.filter(f => regionData[f.properties.name]).length;

    return (
        <div className="relative">
            {/* Summary */}
            <p className="text-sm text-white/70 mb-3">
                {matchedCount} 個地區有資料 / {features.length - matchedCount} 個地區無資料
            </p>

            {/* Controls */}
            <div className="flex items-center gap-2 mb-3">
                <button
                    onClick={handleReset}
                    className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-lg transition-colors"
                    aria-label="重置視角"
                >
                    重置視角
                </button>
                <span className="text-xs text-white/50">滾輪縮放 · 拖曳移動</span>
            </div>

            {/* Map */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <svg
                    ref={svgRef}
                    width="100%"
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    style={{ cursor: 'grab', display: 'block' }}
                >
                    <g transform={transform.toString()}>
                        {features.map(feature => {
                            const name = feature.properties.name;
                            const data = regionData[name];
                            const fill = data ? colorScale(data.count) : '#e5e7eb';
                            return (
                                <path
                                    key={name}
                                    d={pathGen(feature) ?? ''}
                                    fill={fill}
                                    stroke="white"
                                    strokeWidth={0.8}
                                    onMouseMove={(e) =>
                                        setTooltip({ x: e.clientX, y: e.clientY, name, data })
                                    }
                                    onMouseLeave={() => setTooltip(null)}
                                    data-region={name}
                                    data-count={data?.count ?? 0}
                                    style={{ transition: 'fill 0.2s' }}
                                />
                            );
                        })}
                    </g>
                </svg>
            </div>

            {/* Color legend */}
            {maxCount > 0 && (
                <div className="flex items-center gap-2 mt-3 text-xs text-white/60">
                    <span>0</span>
                    <div
                        className="flex-1 h-2 rounded"
                        style={{
                            background: 'linear-gradient(to right, #c7d2fe, #3730a3)',
                        }}
                    />
                    <span>{maxCount.toLocaleString()}</span>
                </div>
            )}

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 pointer-events-none bg-gray-900/90 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
                    style={{ left: tooltip.x + 12, top: tooltip.y - 48 }}
                >
                    <div className="font-semibold mb-0.5">{tooltip.name}</div>
                    {tooltip.data ? (
                        <div>
                            {tooltip.data.count.toLocaleString()} 次 ({tooltip.data.percentage}%)
                        </div>
                    ) : (
                        <div className="text-gray-400">無資料</div>
                    )}
                </div>
            )}
        </div>
    );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd dashboard/frontend
npx vitest run src/features/incense-map/TaiwanMap.test.jsx --no-coverage 2>&1 | tail -20
```

Expected: All 10 tests PASS.

**Step 5: Commit**

```bash
git add dashboard/frontend/src/features/incense-map/TaiwanMap.jsx \
        dashboard/frontend/src/features/incense-map/TaiwanMap.test.jsx
git commit -m "feat(incense-map): add TaiwanMap SVG choropleth component"
```

---

### Task 3: Add tab switcher and integrate TaiwanMap into IncenseMapPage

**Files:**
- Modify: `dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx`
- Modify: `dashboard/frontend/src/features/incense-map/IncenseMapPage.test.jsx`

**Step 1: Update existing tests first**

The existing tests work against the table view. Since we're adding a tab switcher that defaults to `'table'`, all existing tests continue to pass without change. However, we need to add new tests for:
1. Tab switcher renders
2. Map tab shows TaiwanMap
3. regionData is correctly derived from mappedCandidates

Add these tests at the end of the `describe` block in `IncenseMapPage.test.jsx`:

```jsx
// ── Tab 切換 ──────────────────────────────────────────────────────────────

// Mock TaiwanMap to avoid d3 jsdom issues in page-level tests
vi.mock('./TaiwanMap', () => ({
    default: ({ regionData }) => (
        <div data-testid="taiwan-map">
            {Object.entries(regionData).map(([name, d]) => (
                <span key={name} data-region={name} data-count={d.count} />
            ))}
        </div>
    ),
}));

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
    // Table is visible
    expect(screen.getByRole('table')).toBeInTheDocument();
    // Map is not visible
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

    // MOCK_DATA has 台中, 高雄, 台北 — all valid region names
    const map = screen.getByTestId('taiwan-map');
    expect(map.querySelector('[data-region="台中"]')).toBeInTheDocument();
    expect(map.querySelector('[data-region="高雄"]')).toBeInTheDocument();
});

test('regionData respects applied mappings', async () => {
    const user = userEvent.setup();
    fetchIncenseCandidates.mockResolvedValue(MOCK_DATA);
    renderPage();
    await waitFor(() => expect(screen.getByText('台中')).toBeInTheDocument());

    // Map 高雄 + 台北 → 南部 (not a valid region, won't appear in map)
    await uploadMapping(user, { 高雄: '南部', 台北: '南部' });
    await waitFor(() => expect(screen.getByText('南部')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '地圖' }));

    const map = screen.getByTestId('taiwan-map');
    // Only 台中 maps to a real region; 南部 is not a region name
    expect(map.querySelector('[data-region="台中"]')).toBeInTheDocument();
    expect(map.querySelector('[data-region="南部"]')).not.toBeInTheDocument();
});
```

**Step 2: Run new tests to verify they fail**

```bash
cd dashboard/frontend
npx vitest run src/features/incense-map/IncenseMapPage.test.jsx --no-coverage 2>&1 | tail -30
```

Expected: Existing tests PASS, new tab tests FAIL (no tab switcher yet).

**Step 3: Update IncenseMapPage.jsx**

In `IncenseMapPage.jsx`, make the following changes:

1. Add import at top:
```jsx
import TaiwanMap from './TaiwanMap';
```

2. Add `activeTab` state inside the component (after existing state declarations):
```jsx
const [activeTab, setActiveTab] = useState('table');
```

3. Add `regionData` computation (after `mappedCandidates` useMemo, before `sorted`):

Define the set of valid region names using the imported geo data (import at top of file):
```jsx
import taiwanRegionNames from '../../assets/geo/taiwan_regions.json';
```

Then derive regionData:
```jsx
const REGION_NAMES = new Set(
    taiwanRegionNames.features.map(f => f.properties.name)
);

const regionData = useMemo(() => {
    const result = {};
    for (const { word, count, percentage } of mappedCandidates) {
        // Accept both 台 and 臺 variants
        const normalized = word.replace(/臺/g, '台');
        if (REGION_NAMES.has(normalized)) {
            result[normalized] = { count, percentage };
        }
    }
    return result;
}, [mappedCandidates]);
```

Note: Define `REGION_NAMES` as a module-level constant (outside the component) so it's computed once.

4. Replace the content inside `<PageShell>` (the part after `{/* 摘要 */}`) to add tab UI.

After the `{/* 摘要 */}` paragraph and the two existing glass-card sections (time filter + mapping upload), replace the search+download+table section with:

```jsx
{/* Tab switcher */}
<div className="flex gap-1 mb-4">
    {[{ key: 'map', label: '地圖' }, { key: 'table', label: '表格' }].map(({ key, label }) => (
        <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
            }`}
        >
            {label}
        </button>
    ))}
</div>

{/* Map tab */}
{activeTab === 'map' && (
    <TaiwanMap regionData={regionData} />
)}

{/* Table tab */}
{activeTab === 'table' && (
    <>
        {/* 搜尋 + 下載 */}
        <div className="flex gap-2 mb-4">
            ... (keep existing search + download JSX)
        </div>

        {/* 表格 */}
        <div className="glass-card rounded-2xl overflow-hidden">
            ... (keep existing table JSX)
        </div>
    </>
)}
```

The full updated return body (keep all existing JSX for search, download, table; wrap in the table tab conditional).

**Step 4: Run all tests**

```bash
cd dashboard/frontend
npx vitest run src/features/incense-map/ --no-coverage 2>&1 | tail -30
```

Expected: All tests PASS (existing + new tab tests).

**Step 5: Commit**

```bash
git add dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx \
        dashboard/frontend/src/features/incense-map/IncenseMapPage.test.jsx
git commit -m "feat(incense-map): add tab switcher and integrate TaiwanMap with regionData"
```

---

### Task 4: Final verification

**Step 1: Run full frontend test suite**

```bash
cd dashboard/frontend
npx vitest run --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS, no regressions.

**Step 2: Manual smoke test in browser**

```bash
docker-compose up -d dashboard-frontend
```

Open `http://localhost:3000` → navigate to Incense Map page:
- [ ] Tab switcher visible: `[ 地圖 ] [ 表格 ]`
- [ ] Default is `表格` — table shows as before
- [ ] Click `地圖` — Taiwan map SVG renders, regions visible
- [ ] Hover over a region — tooltip shows name, count, percentage (or 無資料)
- [ ] Scroll to zoom in/out — map zooms
- [ ] Drag map — map pans
- [ ] Click `重置視角` — map returns to original view
- [ ] Upload a mapping JSON, switch to map tab — colors update
- [ ] Color legend shows at bottom of map

**Step 3: Commit if any minor style fixes needed**

```bash
git add -p
git commit -m "fix(incense-map): minor style adjustments for map view"
```
