import { useState, useRef, useMemo, useCallback, memo } from 'react';
import { geoMercator, geoPath, geoArea, scaleLinear } from 'd3';
import useTaiwanMap from './useTaiwanMap';
import useWorldCountries from './useWorldCountries';

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

const CARD_SIZE = 90;
const COUNTRY_INSET_SIZE = { width: 160, height: 140 };

/**
 * 共用拖曳 hook — 直接操作 DOM style 確保流暢，放開時才同步 state。
 * containerRef: 限制拖曳範圍的容器 ref
 * onDrop(x, y): 放開時回呼最終座標
 * itemWidth, itemHeight: 被拖曳元素的寬高
 */
function useDrag(containerRef, onDrop, itemWidth, itemHeight) {
    const elRef = useRef(null);
    const dragging = useRef(false);
    const offset = useRef({ dx: 0, dy: 0 });

    const onPointerDown = useCallback((e) => {
        dragging.current = true;
        const cardRect = elRef.current.getBoundingClientRect();
        offset.current = { dx: e.clientX - cardRect.left, dy: e.clientY - cardRect.top };
        e.currentTarget.setPointerCapture(e.pointerId);
        elRef.current.style.cursor = 'grabbing';
        elRef.current.style.zIndex = '20';
    }, []);

    const calcPos = useCallback((e) => {
        const container = containerRef.current;
        if (!container) return { x: 0, y: 0 };
        const rect = container.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(e.clientX - rect.left - offset.current.dx, rect.width - itemWidth)),
            y: Math.max(0, Math.min(e.clientY - rect.top - offset.current.dy, rect.height - itemHeight)),
        };
    }, [containerRef, itemWidth, itemHeight]);

    const onPointerMove = useCallback((e) => {
        if (!dragging.current) return;
        const { x, y } = calcPos(e);
        elRef.current.style.left = `${x}px`;
        elRef.current.style.top = `${y}px`;
    }, [calcPos]);

    const onPointerUp = useCallback((e) => {
        if (!dragging.current) return;
        dragging.current = false;
        elRef.current.style.cursor = 'grab';
        elRef.current.style.zIndex = '';
        const { x, y } = calcPos(e);
        onDrop(x, y);
    }, [calcPos, onDrop]);

    return { elRef, dragging, onPointerDown, onPointerMove, onPointerUp };
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
 * 單一離島放大圖 (Inset Map) — 可自由拖曳。
 * 使用獨立投影，參考 docs/taiwan_geo_demo.html 的 createInset。
 */
const InsetMap = memo(function InsetMap({ feature: ft, label, width, height, topN, x, y, containerRef, onDrop, regionData, colorScale, onTooltip }) {
    const labelHeight = 22;
    const svgHeight = height - labelHeight;

    const handleDrop = useCallback((nx, ny) => onDrop(nx, ny), [onDrop]);
    const { elRef, dragging, onPointerDown, onPointerMove, onPointerUp } = useDrag(containerRef, handleDrop, width, height);

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
            ref={elRef}
            className="glass-card rounded-lg overflow-hidden border border-white/20 select-none"
            style={{ width, height, position: 'absolute', left: x, top: y, cursor: 'grab', touchAction: 'none', zIndex: 10 }}
            data-testid={`inset-${name}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onMouseMove={(e) => {
                if (!dragging.current)
                    onTooltip({ x: e.clientX, y: e.clientY, name, data });
            }}
            onMouseLeave={() => onTooltip(null)}
        >
            <div className="text-[11px] font-semibold text-white/60 px-2 pt-1 pb-0 leading-tight pointer-events-none"
                 style={{ height: labelHeight }}>
                {label}
            </div>
            <svg width={width} height={svgHeight} style={{ display: 'block' }} className="pointer-events-none">
                <path
                    d={pathGen(displayFeature) ?? ''}
                    fill={fill}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1.2}
                    style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    data-region={name}
                    data-count={data?.count ?? 0}
                />
            </svg>
        </div>
    );
});

/**
 * 品牌/遊戲卡片 — 非地理區域的上香對象，用色階深淺表示數值。
 * 可在地圖容器內自由拖曳。
 */
const BrandCard = memo(function BrandCard({ name, logo, x, y, containerRef, onDrop, regionData, colorScale, onTooltip }) {
    const data = regionData[name];
    const bgColor = data ? colorScale(data.count) : '#e5e7eb';
    const textColor = data && data.count > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)';

    const handleDrop = useCallback((nx, ny) => onDrop(name, nx, ny), [name, onDrop]);
    const { elRef, dragging, onPointerDown, onPointerMove, onPointerUp } = useDrag(containerRef, handleDrop, CARD_SIZE, CARD_SIZE);

    return (
        <div
            ref={elRef}
            className="rounded-lg overflow-hidden border border-white/20 flex flex-col items-center justify-center gap-1 select-none"
            style={{
                width: CARD_SIZE, height: CARD_SIZE,
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
});

/**
 * 國家放大圖 (Country Inset) — 用 world-atlas 的 GeoJSON 渲染單一國家輪廓。
 * 可在地圖容器內自由拖曳，與離島 InsetMap 共用相同互動模式。
 */
const CountryInset = memo(function CountryInset({ name, label, matchKey, feature: ft, x, y, containerRef, onDrop, regionData, colorScale, onTooltip }) {
    const { width, height } = COUNTRY_INSET_SIZE;
    const labelHeight = 22;
    const svgHeight = height - labelHeight;

    const handleDrop = useCallback((nx, ny) => onDrop(name, nx, ny), [name, onDrop]);
    const { elRef, dragging, onPointerDown, onPointerMove, onPointerUp } = useDrag(containerRef, handleDrop, width, height);

    const projection = useMemo(() => {
        if (!ft) return null;
        const pad = 8;
        return geoMercator().fitExtent(
            [[pad, pad], [width - pad, svgHeight - pad]],
            ft
        );
    }, [ft, width, svgHeight]);

    const pathGen = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

    if (!ft || !pathGen) return null;

    const displayLabel = label || name;
    const dataKey = matchKey || name;
    const data = regionData[dataKey];
    const fill = data ? colorScale(data.count) : '#e5e7eb';

    return (
        <div
            ref={elRef}
            className="glass-card rounded-lg overflow-hidden border border-white/20 select-none"
            style={{ width, height, position: 'absolute', left: x, top: y, cursor: 'grab', touchAction: 'none', zIndex: 10 }}
            data-testid={`country-${name}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onMouseMove={(e) => {
                if (!dragging.current)
                    onTooltip({ x: e.clientX, y: e.clientY, name: displayLabel, data });
            }}
            onMouseLeave={() => onTooltip(null)}
        >
            <div className="text-[11px] font-semibold text-white/60 px-2 pt-1 pb-0 leading-tight pointer-events-none"
                 style={{ height: labelHeight }}>
                {displayLabel}
            </div>
            <svg width={width} height={svgHeight} style={{ display: 'block' }} className="pointer-events-none">
                <path
                    d={pathGen(ft) ?? ''}
                    fill={fill}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1.2}
                    style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    data-region={dataKey}
                    data-count={data?.count ?? 0}
                />
            </svg>
        </div>
    );
});

/**
 * 主地圖 SVG（本島 + 澎湖）— memo 避免 brands 變動導致地圖路徑重繪。
 */
const MainMapSvg = memo(function MainMapSvg({ mainFeatures, pathGen, regionData, colorScale, scale, onTooltip }) {
    return (
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
                            onTooltip({ x: e.clientX, y: e.clientY, name, data })
                        }
                        onMouseLeave={() => onTooltip(null)}
                    />
                );
            })}
        </svg>
    );
});

export default memo(function TaiwanMap({ regionData, brands = [], countries = [] }) {
    const { features, loading, error } = useTaiwanMap();
    const { countryFeatures } = useWorldCountries(countries);
    const [tooltip, setTooltip] = useState(null);
    const [scale, setScale] = useState(60);
    const mapContainerRef = useRef(null);

    // 所有可拖曳元素的位置（inset + brand），統一管理
    const [positions, setPositions] = useState(() => {
        const pos = {};
        let iy = 12;
        for (const ins of INSETS) {
            pos[`inset-${ins.name}`] = { x: 12, y: iy };
            iy += ins.height + 8;
        }
        brands.forEach((b, i) => {
            pos[`brand-${b.name}`] = { x: 12 + (i % 3) * 96, y: iy + Math.floor(i / 3) * 96 };
        });
        // Country insets: 右側垂直排列
        countries.forEach((c, i) => {
            pos[`country-${c.name}`] = { x: MAIN_WIDTH - COUNTRY_INSET_SIZE.width - 12, y: 12 + i * (COUNTRY_INSET_SIZE.height + 8) };
        });
        return pos;
    });

    // 新增品牌時自動分配預設位置，而非重建整個 state
    const prevBrandCountRef = useRef(brands.length);
    if (brands.length !== prevBrandCountRef.current) {
        const newPositions = { ...positions };
        let needsUpdate = false;
        // Inset 底部偏移
        let baseY = 12;
        for (const ins of INSETS) {
            baseY += ins.height + 8;
        }
        brands.forEach((b, i) => {
            const key = `brand-${b.name}`;
            if (!newPositions[key]) {
                newPositions[key] = { x: 12 + (i % 3) * 96, y: baseY + Math.floor(i / 3) * 96 };
                needsUpdate = true;
            }
        });
        // 清理已刪除品牌的位置
        const brandKeys = new Set(brands.map((b) => `brand-${b.name}`));
        for (const key of Object.keys(newPositions)) {
            if (key.startsWith('brand-') && !brandKeys.has(key)) {
                delete newPositions[key];
                needsUpdate = true;
            }
        }
        if (needsUpdate) {
            setPositions(newPositions);
        }
        prevBrandCountRef.current = brands.length;
    }

    // 國家 inset 增量位置管理
    const prevCountryCountRef = useRef(countries.length);
    if (countries.length !== prevCountryCountRef.current) {
        const newPositions = { ...positions };
        let needsUpdate = false;
        countries.forEach((c, i) => {
            const key = `country-${c.name}`;
            if (!newPositions[key]) {
                newPositions[key] = { x: MAIN_WIDTH - COUNTRY_INSET_SIZE.width - 12, y: 12 + i * (COUNTRY_INSET_SIZE.height + 8) };
                needsUpdate = true;
            }
        });
        const countryKeys = new Set(countries.map((c) => `country-${c.name}`));
        for (const key of Object.keys(newPositions)) {
            if (key.startsWith('country-') && !countryKeys.has(key)) {
                delete newPositions[key];
                needsUpdate = true;
            }
        }
        if (needsUpdate) setPositions(newPositions);
        prevCountryCountRef.current = countries.length;
    }

    const onItemDrop = useCallback((key, x, y) => {
        setPositions((prev) => ({ ...prev, [key]: { x, y } }));
    }, []);

    // Inset drop handlers (curried by name)
    const insetDropHandlers = useMemo(
        () => Object.fromEntries(
            INSETS.map((ins) => [ins.name, (x, y) => onItemDrop(`inset-${ins.name}`, x, y)])
        ),
        [onItemDrop]
    );

    const onBrandDrop = useCallback((name, x, y) => {
        onItemDrop(`brand-${name}`, x, y);
    }, [onItemDrop]);

    const onCountryDrop = useCallback((name, x, y) => {
        onItemDrop(`country-${name}`, x, y);
    }, [onItemDrop]);

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
                {/* Main SVG (本島 + 澎湖) — memo 化避免品牌變動時重繪 */}
                <MainMapSvg
                    mainFeatures={mainFeatures}
                    pathGen={pathGen}
                    regionData={regionData}
                    colorScale={colorScale}
                    scale={scale}
                    onTooltip={handleTooltip}
                />

                {/* Draggable inset maps */}
                {insetFeatures.map(({ name, label, width, height, topN, feature: ft }) => {
                    const pos = positions[`inset-${name}`] ?? { x: 12, y: 12 };
                    return (
                        <InsetMap
                            key={name}
                            feature={ft}
                            label={label}
                            width={width}
                            height={height}
                            topN={topN}
                            x={pos.x}
                            y={pos.y}
                            containerRef={mapContainerRef}
                            onDrop={insetDropHandlers[name]}
                            regionData={regionData}
                            colorScale={colorScale}
                            onTooltip={handleTooltip}
                        />
                    );
                })}

                {/* Draggable brand / game cards */}
                {brands.map(({ name, logo }) => {
                    const pos = positions[`brand-${name}`] ?? { x: 12, y: 380 };
                    return (
                        <BrandCard
                            key={name}
                            name={name}
                            logo={logo}
                            x={pos.x}
                            y={pos.y}
                            containerRef={mapContainerRef}
                            onDrop={onBrandDrop}
                            regionData={regionData}
                            colorScale={colorScale}
                            onTooltip={handleTooltip}
                        />
                    );
                })}

                {/* Draggable country inset maps */}
                {countryFeatures.map(({ name, label, matchKey, feature: ft }) => {
                    const pos = positions[`country-${name}`] ?? { x: MAIN_WIDTH - COUNTRY_INSET_SIZE.width - 12, y: 12 };
                    return (
                        <CountryInset
                            key={name}
                            name={name}
                            label={label}
                            matchKey={matchKey}
                            feature={ft}
                            x={pos.x}
                            y={pos.y}
                            containerRef={mapContainerRef}
                            onDrop={onCountryDrop}
                            regionData={regionData}
                            colorScale={colorScale}
                            onTooltip={handleTooltip}
                        />
                    );
                })}
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
});
