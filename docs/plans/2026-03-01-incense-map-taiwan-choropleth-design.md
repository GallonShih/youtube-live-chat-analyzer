```markdown
# Design: Incense Map Taiwan Choropleth

Date: 2026-03-01
Updated: 2026-03-02

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
SVG Choropleth Map (with inset maps for Matsu & Kinmen)
```

## Geo Data Source

- **Source**: `taiwan-atlas` CDN TopoJSON (`https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json`)
- **Format**: TopoJSON → converted to GeoJSON features at runtime via `topojson-client`
- **Processing**: auto-merge 新竹市/新竹縣 → 新竹, 嘉義市/嘉義縣 → 嘉義; strip 縣/市 suffix
- **Result**: 22 administrative regions (20 individual + 2 merged)
- **Reference**: `docs/taiwan_geo_demo.html` — working prototype with identical merge/clean logic

## Map Component

- **Rendering**: d3-geo `geoMercator().fitSize()` projection of GeoJSON polygons into SVG paths
- **Color**: linear scale on `count`; regions with no data shown in gray (#e5e7eb)
- **Hover tooltip**: floating tooltip showing region name, count, percentage (or "無資料")
- **Zoom/pan**: d3-zoom applied to SVG `<g>` transform, scaleExtent [0.5, 8]
- **Reset button**: button to return to original viewport (zoomIdentity)
- **Color legend**: below map, showing min–max color gradient
- **Inset maps**: 連江(馬祖) and 金門 displayed as separate small SVG boxes with independent projections, matching the approach in `taiwan_geo_demo.html`

## Inset Maps Design

Two small boxes rendered at fixed positions, each containing an independently-projected view of the island group:
- **連江 (馬祖)**: top-right, 140×140px
- **金門**: below 馬祖, 140×140px
- Each uses `geoMercator().fitExtent()` for its own feature
- Hover tooltip works consistently with main map
- Glass-card styling consistent with dashboard theme

## Matching Logic

- A `mappedCandidates` entry matches a region if its `word` equals a region name exactly
- Region names are derived from the TopoJSON data after merge and clean processing
- Accept both `台` and `臺` variants (e.g. 台南 = 臺南)
- Unmatched words are counted and displayed as a hint: "X 個地區有資料 / Y 個地區無資料"

## File Structure

```
src/features/incense-map/
  IncenseMapPage.jsx     — add tab state, import TaiwanMap
  TaiwanMap.jsx          — new: SVG map, d3-geo + d3-zoom + inset maps
  useTaiwanMap.js        — new: TopoJSON loading, merge logic, zoom state hook
```

No static GeoJSON asset needed — data is loaded dynamically from CDN.

## Dependencies

- `d3` v7 (already installed) — provides d3-geo, d3-scale, d3-zoom, d3-selection
- `topojson-client` — NEW dependency, needed to convert TopoJSON to GeoJSON (`topojson.feature`, `topojson.merge`)

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Layout | Tab switcher | User preference |
| Map rendering | SVG + d3-geo | Lightweight, supports zoom/pan via d3-zoom |
| Geo data source | taiwan-atlas CDN (TopoJSON) | Higher boundary precision, no static file maintenance, same source as demo |
| Inset maps | Yes (馬祖 + 金門) | Better UX for outlying islands, consistent with demo prototype |
| Interaction | Hover tooltip + zoom/pan | User preference |
| Geo data processing | Runtime merge + clean | Identical logic to taiwan_geo_demo.html |

```
