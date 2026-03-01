# Design: Incense Map Taiwan Choropleth

Date: 2026-03-01

## Overview

Add a Taiwan administrative district choropleth map to the existing Incense Map page. The map visualizes how incense candidates are distributed across Taiwan's 22 regions after mapping JSON is applied. The page gains a tab switcher so users can toggle between the map view and the existing table view.

## Layout

Controls (time filter + mapping upload) remain unchanged at the top. Below them, a tab bar appears:

```
[ 地圖 ] [ 表格 ]
─────────────────────────
  tab content
```

## Data Flow

```
data.candidates
     ↓ apply mappings (existing applyOneMapping logic)
mappedCandidates
     ↓ filter words that match taiwan_region names in geo data
regionData = { "台北": { count, percentage }, ... }
     ↓
SVG Choropleth Map
```

## Map Component

- **Rendering**: d3-geo projection of GeoJSON polygons into SVG paths
- **Color**: linear scale on `count`; regions with no data shown in gray
- **Hover tooltip**: floating tooltip showing region name, count, percentage
- **Zoom/pan**: d3-zoom applied to SVG `<g>` transform
- **Reset button**: double-click or button to return to original viewport
- **Color legend**: below map, showing min–max color scale

## Matching Logic

- A `mappedCandidates` entry matches a region if its `word` equals a `taiwan_region` name exactly
- Accept both `台` and `臺` variants (e.g. 台南 = 臺南)
- Unmatched words are counted and displayed as a hint: "X 個詞彙已對應地區 / Y 個未對應"

## File Structure

```
src/features/incense-map/
  IncenseMapPage.jsx     — add tab state, import TaiwanMap
  TaiwanMap.jsx          — new: SVG map, d3-geo + d3-zoom
  useTaiwanMap.js        — new: zoom/projection hook
src/assets/geo/
  taiwan_regions.json    — copied from docs/geo_data_extracted.json (taiwan_region features only)
```

## Dependencies

- `d3-geo`: projection and path generation
- `d3-scale`: color scale
- `d3-zoom`: zoom and pan behavior
- `d3-selection`: DOM binding

All d3 sub-packages are preferred over the full `d3` bundle to minimize bundle size.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Layout | Tab switcher | User preference |
| Map rendering | SVG + d3-geo | Lightweight, offline, supports zoom/pan via d3-zoom |
| Interaction | Hover tooltip only | User preference (no click navigation needed) |
| Geo data | taiwan_region features only | Only Taiwan districts needed |
