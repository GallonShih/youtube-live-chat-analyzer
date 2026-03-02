# Incense Map Taiwan Choropleth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **Updated:** 2026-03-02 — Changed to CDN TopoJSON source + inset maps for outlying islands.

**Goal:** Add a Taiwan choropleth map to the Incense Map page, integrated with the existing mapping-JSON workflow, with tab switching between map view and table view.

**Architecture:** A new `TaiwanMap.jsx` component renders 22 Taiwan administrative districts as SVG paths using d3-geo projection + d3-zoom for pan/zoom. A `useTaiwanMap.js` hook handles TopoJSON loading from the `taiwan-atlas` CDN, merging 新竹市/縣 and 嘉義市/縣, stripping 縣/市 suffixes, and providing zoom state. `IncenseMapPage` gains a tab switcher; `mappedCandidates` whose `word` matches a region name flow into `regionData` and color the map. Inset maps show 連江(馬祖) and 金門 at enlarged scale. Reference prototype: `docs/taiwan_geo_demo.html`.

**Tech Stack:** React, d3 v7 (already installed: geoMercator, geoPath, zoom, scaleLinear, select), topojson-client (NEW), Vitest + Testing Library, Tailwind CSS

---

### Task 1: Install topojson-client dependency

**Step 1: Install**

```bash
cd dashboard/frontend
npm install topojson-client
```

**Step 2: Verify**

```bash
grep topojson-client package.json
```

Expected: `"topojson-client": "^3.x.x"` in dependencies.

---

### Task 2: Create useTaiwanMap hook

**Files:**
- Create: `dashboard/frontend/src/features/incense-map/useTaiwanMap.js`

This hook encapsulates all TopoJSON loading and processing logic, mirroring `docs/taiwan_geo_demo.html`:

**Responsibilities:**
1. Fetch TopoJSON from `https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json`
2. Merge 新竹市+新竹縣 → 新竹, 嘉義市+嘉義縣 → 嘉義 (using `topojson.merge`)
3. Clean names: strip 縣/市 suffix via `cleanName()`
4. Return `{ features, loading, error }` where features is the final 22-region GeoJSON array
5. Export `REGION_NAMES` set and `cleanName` for reuse

---

### Task 3: Create TaiwanMap component (TDD)

**Files:**
- Create: `dashboard/frontend/src/features/incense-map/TaiwanMap.jsx`
- Create: `dashboard/frontend/src/features/incense-map/TaiwanMap.test.jsx`

**TaiwanMap.jsx responsibilities:**
1. Use `useTaiwanMap()` hook to get features
2. Render main SVG with `geoMercator().fitSize()` + `geoPath()` for 22 regions
3. Color regions using `scaleLinear` on `regionData[name].count`
4. Render inset maps for 連江(馬祖) and 金門 with independent projections
5. Hover tooltip showing name + count + percentage (or "無資料")
6. d3-zoom for pan/zoom on main map
7. Reset button to restore original viewport
8. Color legend gradient bar

**Tests (TaiwanMap.test.jsx):**
- Mock `useTaiwanMap` to return static features (avoid network calls in tests)
- Test: renders SVG element
- Test: renders a path for each Taiwan region (22 paths with data-region)
- Test: matched regions have correct data-count
- Test: unmatched regions have data-count 0
- Test: shows match summary text
- Test: shows tooltip on mouse move
- Test: hides tooltip on mouse leave
- Test: shows "無資料" for unmatched regions
- Test: renders reset button
- Test: renders with empty regionData
- Test: renders inset maps for 連江 and 金門
- Test: shows loading state while features load

---

### Task 4: Add tab switcher and integrate TaiwanMap into IncenseMapPage

**Files:**
- Modify: `dashboard/frontend/src/features/incense-map/IncenseMapPage.jsx`
- Modify: `dashboard/frontend/src/features/incense-map/IncenseMapPage.test.jsx`

**IncenseMapPage.jsx changes:**
1. Add `import TaiwanMap from './TaiwanMap'`
2. Add `import { REGION_NAMES } from './useTaiwanMap'`
3. Add `activeTab` state (default: `'table'`)
4. Derive `regionData` from `mappedCandidates` — match words to REGION_NAMES (with 台↔臺 normalization)
5. Add tab switcher UI (`地圖` / `表格` buttons) after mapping upload section
6. Wrap search+download+table in `{activeTab === 'table' && ...}`
7. Add `{activeTab === 'map' && <TaiwanMap regionData={regionData} />}`

**New tests for IncenseMapPage.test.jsx:**
- Mock TaiwanMap to avoid d3/network issues
- Test: renders tab switcher with 地圖 and 表格 tabs
- Test: default tab is 表格, shows table content
- Test: clicking 地圖 tab shows TaiwanMap and hides table
- Test: regionData passed to TaiwanMap contains matched candidates
- Test: regionData respects applied mappings

---

### Task 5: Final verification

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
- [ ] Click `地圖` — Taiwan map SVG renders, 22 regions visible
- [ ] Inset maps for 連江(馬祖) and 金門 visible in top-right area
- [ ] Hover over a region — tooltip shows name, count, percentage (or 無資料)
- [ ] Scroll to zoom in/out — map zooms
- [ ] Drag map — map pans
- [ ] Click `重置視角` — map returns to original view
- [ ] Hover inset map regions — tooltip works
- [ ] Upload a mapping JSON, switch to map tab — colors update
- [ ] Color legend shows at bottom of map