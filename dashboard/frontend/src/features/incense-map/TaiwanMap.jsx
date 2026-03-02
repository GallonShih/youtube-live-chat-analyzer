import { useState, useRef, useMemo, useCallback } from 'react';
import { geoMercator, geoPath, geoArea, scaleLinear } from 'd3';
import useTaiwanMap from './useTaiwanMap';

/** 主地圖 SVG 尺寸 */
const MAIN_WIDTH = 420;
const MAIN_HEIGHT = 520;

/** 離島名稱 — 主地圖投影時排除（只有金門、連江，澎湖留在主地圖） */
const ISLAND_NAMES = new Set(['連江', '金門']);

/** 離島放大圖設定：只有連江 (馬祖) 和金門 */
const INSETS = [
    { name: '連江', label: '連江 (馬祖)', width: 200, height: 180, topN: 2 },
    { name: '金門', label: '金門',       width: 200, height: 150, topN: 2 },
];

/**
 * 計算 inset 面板佔據的禁區矩形列表。
 * Inset 面板位於容器 left:12, top:12, 間距 gap:8 垂直排列。
 */
function getInsetRects() {
    const pad = 12; // top-3 = 0.75rem ≈ 12px
    const gap = 8;  // gap-2
    const rects = [];
    let y = pad;
    for (const { width, height } of INSETS) {
        rects.push({ x: pad, y, w: width, h: height });
        y += height + gap;
    }
    return rects;
}
const INSET_RECTS = getInsetRects();
const CARD_SIZE = 90;

/**
 * 檢查矩形 A 與 B 是否重疊
 */
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * 如果 (x, y) 處的卡片與任一 inset 重疊，將卡片推到 inset 下方。
 */
function avoidInsetOverlap(x, y) {
    for (const r of INSET_RECTS) {
        if (rectsOverlap(x, y, CARD_SIZE, CARD_SIZE, r.x, r.y, r.w, r.h)) {
            // 推到這個 inset 的正下方
            y = r.y + r.h + 8;
        }
    }
    return { x, y };
}

/**
 * 從 MultiPolygon / Polygon 中只保留面積最大的 N 個 polygon。
 * 用於金門 inset：只留大金門 + 小金門，去掉大膽、二膽等極小島嶼。
 */
function keepLargestPolygons(feature, n) {
    if (!n || !feature) return feature;
    const geom = feature.geometry;
    if (geom.type === 'Polygon') return feature; // 只有一個 polygon，直接回傳

    if (geom.type === 'MultiPolygon') {
        // 計算每個 polygon 的面積並排序取前 N 個
        const ranked = geom.coordinates
            .map((coords) => ({
                coords,
                area: geoArea({ type: 'Polygon', coordinates: coords }),
            }))
            .sort((a, b) => b.area - a.area)
            .slice(0, n);

        return {
            ...feature,
            geometry: {
                type: ranked.length === 1 ? 'Polygon' : 'MultiPolygon',
                coordinates: ranked.length === 1
                    ? ranked[0].coords
                    : ranked.map((r) => r.coords),
            },
        };
    }
    return feature;
}

/**
 * 單一離島放大圖 (Inset Map)
 * 使用獨立投影，參考 docs/taiwan_geo_demo.html 的 createInset。
 */
function InsetMap({ feature: ft, label, width, height, topN, regionData, colorScale, onTooltip }) {
    const labelHeight = 22;
    const svgHeight = height - labelHeight;

    // 過濾只保留最大的 N 個 polygon（例如金門只留大金門+小金門）
    const displayFeature = useMemo(() => keepLargestPolygons(ft, topN), [ft, topN]);

    const projection = useMemo(() => {
        if (!displayFeature) return null;
        // 小 padding 讓島嶼在框內盡量放大，獨立於主地圖的縮放比例
        const pad = 6;
        return geoMercator().fitExtent(
            [[pad, pad], [width - pad, svgHeight - pad]],
            displayFeature
        );
    }, [displayFeature, width, svgHeight]);

    const pathGen = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

    if (!displayFeature || !pathGen) return null;

    const name = ft.properties.COUNTYNAME;
    const data = regionData[name];
    const fill = data ? colorScale(data.count) : '#e5e7eb';

    return (
        <div
            className="glass-card rounded-lg overflow-hidden border border-white/20"
            style={{ width, height }}
            data-testid={`inset-${name}`}
        >
            <div className="text-[11px] font-semibold text-white/60 px-2 pt-1 pb-0 leading-tight"
                 style={{ height: labelHeight }}>
                {label}
            </div>
            <svg width={width} height={svgHeight} style={{ display: 'block' }}>
                <path
                    d={pathGen(displayFeature) ?? ''}
                    fill={fill}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1.2}
                    style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    data-region={name}
                    data-count={data?.count ?? 0}
                    onMouseMove={(e) =>
                        onTooltip({ x: e.clientX, y: e.clientY, name, data })
                    }
                    onMouseLeave={() => onTooltip(null)}
                />
            </svg>
        </div>
    );
}

/**
 * 品牌/遊戲卡片 — 非地理區域的上香對象，用色階深淺表示數值。
 * 可在地圖容器內自由拖曳（直接操作 DOM style，避免高頻 re-render）。
 */
function BrandCard({ name, logo, x, y, containerRef, onDrop, regionData, colorScale, onTooltip }) {
    const data = regionData[name];
    const bgColor = data ? colorScale(data.count) : '#e5e7eb';
    const textColor = data && data.count > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)';
    const elRef = useRef(null);
    const dragging = useRef(false);
    const offset = useRef({ dx: 0, dy: 0 });

    const clamp = useCallback((clientX, clientY) => {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(clientX - rect.left - offset.current.dx, rect.width - 90)),
            y: Math.max(0, Math.min(clientY - rect.top - offset.current.dy, rect.height - 90)),
        };
    }, [containerRef]);

    const onPointerDown = useCallback((e) => {
        dragging.current = true;
        const el = elRef.current;
        offset.current = { dx: e.clientX - el.offsetLeft - (containerRef.current?.getBoundingClientRect().left ?? 0) + (containerRef.current?.getBoundingClientRect().left ?? 0) - el.getBoundingClientRect().left + (e.clientX - e.clientX), dy: 0 };
        // 簡單計算：pointer 在卡片內的 offset
        const cardRect = el.getBoundingClientRect();
        offset.current = { dx: e.clientX - cardRect.left, dy: e.clientY - cardRect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        el.style.zIndex = '20';
    }, [containerRef]);

    const onPointerMove = useCallback((e) => {
        if (!dragging.current) return;
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let nx = Math.max(0, Math.min(e.clientX - rect.left - offset.current.dx, rect.width - 90));
        let ny = Math.max(0, Math.min(e.clientY - rect.top - offset.current.dy, rect.height - 90));
        // 避開 inset 區域
        const safe = avoidInsetOverlap(nx, ny);
        nx = safe.x; ny = Math.min(safe.y, rect.height - 90);
        const el = elRef.current;
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
    }, [containerRef]);

    const onPointerUp = useCallback((e) => {
        if (!dragging.current) return;
        dragging.current = false;
        const el = elRef.current;
        el.style.cursor = 'grab';
        el.style.zIndex = '';
        // 同步最終位置到 React state
        const container = containerRef.current;
        if (container) {
            const rect = container.getBoundingClientRect();
            let nx = Math.max(0, Math.min(e.clientX - rect.left - offset.current.dx, rect.width - 90));
            let ny = Math.max(0, Math.min(e.clientY - rect.top - offset.current.dy, rect.height - 90));
            const safe = avoidInsetOverlap(nx, ny);
            onDrop(name, safe.x, Math.min(safe.y, rect.height - 90));
        }
    }, [name, onDrop, containerRef]);

    return (
        <div
            ref={elRef}
            className="rounded-lg overflow-hidden border border-white/20 flex flex-col items-center justify-center gap-1 select-none"
            style={{
                width: 90, height: 90,
                backgroundColor: bgColor,
                cursor: 'grab',
                position: 'absolute',
                left: x, top: y,
                touchAction: 'none',
                transition: 'background-color 0.2s',
            }}
            data-testid={`brand-${name}`}
            data-count={data?.count ?? 0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onMouseMove={(e) => {
                if (!dragging.current)
                    onTooltip({ x: e.clientX, y: e.clientY, name, data });
            }}
            onMouseLeave={() => onTooltip(null)}
        >
            {logo ? (
                <img
                    src={logo}
                    alt={name}
                    className="w-10 h-10 object-contain pointer-events-none"
                    draggable={false}
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg pointer-events-none"
                     style={{ color: textColor }}>
                    {name.charAt(0)}
                </div>
            )}
            <span className="text-[10px] font-semibold leading-tight text-center px-1 pointer-events-none"
                  style={{ color: textColor }}>
                {name}
            </span>
        </div>
    );
}

export default function TaiwanMap({ regionData, brands = [] }) {
    const { features, loading, error } = useTaiwanMap();
    const [tooltip, setTooltip] = useState(null);
    const [scale, setScale] = useState(60);
    const mapContainerRef = useRef(null);

    // 品牌卡片位置（相對於地圖容器），預設放在左下角（避開左上角 inset 區域）
    const [brandPositions, setBrandPositions] = useState(() => {
        const pos = {};
        brands.forEach((b, i) => {
            // 左下角起始，每個卡片橫向間隔 96px，每排 3 個
            pos[b.name] = { x: 12 + (i % 3) * 96, y: 380 + Math.floor(i / 3) * 96 };
        });
        return pos;
    });

    // 拖曳結束時才更新 state（避免高頻 re-render）
    const onBrandDrop = useCallback((name, x, y) => {
        setBrandPositions((prev) => ({ ...prev, [name]: { x, y } }));
    }, []);

    // 主地圖只包含本島（排除離島）
    const mainFeatures = useMemo(
        () => features.filter((f) => !ISLAND_NAMES.has(f.properties.COUNTYNAME)),
        [features]
    );

    // 投影：只 fitSize 到本島 features
    const projection = useMemo(() => {
        if (mainFeatures.length === 0) return null;
        return geoMercator().fitSize(
            [MAIN_WIDTH, MAIN_HEIGHT],
            { type: 'FeatureCollection', features: mainFeatures }
        );
    }, [mainFeatures]);

    const pathGen = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

    // 色階
    const maxCount = useMemo(
        () => Math.max(0, ...Object.values(regionData).map((d) => d.count)),
        [regionData]
    );

    const colorScale = useMemo(
        () => scaleLinear().domain([0, Math.max(1, maxCount)]).range(['#c7d2fe', '#3730a3']),
        [maxCount]
    );

    const handleTooltip = useCallback((val) => setTooltip(val), []);

    // Loading / Error states
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-white/70" data-testid="map-loading">
                載入地圖中...
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex items-center justify-center h-64 text-red-300" data-testid="map-error">
                地圖載入失敗：{error}
            </div>
        );
    }

    const matchedCount = features.filter((f) => regionData[f.properties.COUNTYNAME]).length;

    // 離島 features for insets
    const insetFeatures = INSETS.map(({ name, label, width, height, topN }) => ({
        name,
        label,
        width,
        height,
        topN,
        feature: features.find((f) => f.properties.COUNTYNAME === name) ?? null,
    }));

    return (
        <div className="relative">
            {/* Summary + size slider */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm text-white/70">
                    {matchedCount} 個地區有資料 / {features.length - matchedCount} 個地區無資料
                </p>
                <div className="flex items-center gap-2 text-xs text-white/50">
                    <span>小</span>
                    <input
                        type="range"
                        min={30}
                        max={90}
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                        className="w-24 accent-indigo-400"
                        aria-label="地圖大小"
                    />
                    <span>大</span>
                </div>
            </div>

            {/* Main map container with insets overlaid */}
            <div ref={mapContainerRef} className="relative glass-card rounded-2xl overflow-hidden">
                {/* Main SVG (本島 + 澎湖) */}
                <svg
                    width="100%"
                    viewBox={`0 0 ${MAIN_WIDTH} ${MAIN_HEIGHT}`}
                    style={{
                        display: 'block',
                        maxHeight: `${scale}vh`,
                        width: 'auto',
                        margin: '0 auto',
                    }}
                >
                    {mainFeatures.map((feat) => {
                        const name = feat.properties.COUNTYNAME;
                        const data = regionData[name];
                        const fill = data ? colorScale(data.count) : '#e5e7eb';
                        return (
                            <path
                                key={name}
                                d={pathGen?.(feat) ?? ''}
                                fill={fill}
                                stroke="rgba(255,255,255,0.8)"
                                strokeWidth={1.2}
                                style={{ transition: 'fill 0.2s', cursor: 'pointer' }}
                                data-region={name}
                                data-count={data?.count ?? 0}
                                onMouseMove={(e) =>
                                    setTooltip({ x: e.clientX, y: e.clientY, name, data })
                                }
                                onMouseLeave={() => setTooltip(null)}
                            />
                        );
                    })}
                </svg>

                {/* Inset maps — absolute positioned top-left inside main map */}
                <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                    {insetFeatures.map(({ name, label, width, height, topN, feature: ft }) => (
                        <InsetMap
                            key={name}
                            feature={ft}
                            label={label}
                            width={width}
                            height={height}
                            topN={topN}
                            regionData={regionData}
                            colorScale={colorScale}
                            onTooltip={handleTooltip}
                        />
                    ))}
                </div>

                {/* Draggable brand / game cards */}
                {brands.map(({ name, logo }) => (
                    <BrandCard
                        key={name}
                        name={name}
                        logo={logo}
                        x={brandPositions[name]?.x ?? 12}
                        y={brandPositions[name]?.y ?? 380}
                        containerRef={mapContainerRef}
                        onDrop={onBrandDrop}
                        regionData={regionData}
                        colorScale={colorScale}
                        onTooltip={handleTooltip}
                    />
                ))}
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
                    data-testid="map-tooltip"
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
