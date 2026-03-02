import { useState, useMemo, useCallback } from 'react';
import { geoMercator, geoPath, geoArea, scaleLinear } from 'd3';
import useTaiwanMap from './useTaiwanMap';

/** 主地圖 SVG 尺寸 */
const MAIN_WIDTH = 480;
const MAIN_HEIGHT = 640;

/** 離島名稱 — 主地圖投影時排除（只有金門、連江，澎湖留在主地圖） */
const ISLAND_NAMES = new Set(['連江', '金門']);

/** 離島放大圖設定：只有連江 (馬祖) 和金門 */
const INSETS = [
    { name: '連江', label: '連江 (馬祖)', width: 200, height: 180, topN: 2 },
    { name: '金門', label: '金門',       width: 200, height: 150, topN: 2 },
];

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

export default function TaiwanMap({ regionData }) {
    const { features, loading, error } = useTaiwanMap();
    const [tooltip, setTooltip] = useState(null);

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
            {/* Summary */}
            <p className="text-sm text-white/70 mb-3">
                {matchedCount} 個地區有資料 / {features.length - matchedCount} 個地區無資料
            </p>

            {/* Main map container with insets overlaid */}
            <div className="relative glass-card rounded-2xl overflow-hidden">
                {/* Main SVG (本島 + 澎湖) */}
                <svg
                    width="100%"
                    viewBox={`0 0 ${MAIN_WIDTH} ${MAIN_HEIGHT}`}
                    style={{ display: 'block' }}
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
