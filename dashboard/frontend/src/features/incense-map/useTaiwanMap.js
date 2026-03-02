import { useState, useEffect } from 'react';
import { feature, merge } from 'topojson-client';

const MAP_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/counties-10t.json';

// 合併規則：新竹市+新竹縣 → 新竹, 嘉義市+嘉義縣 → 嘉義
const MERGE_GROUPS = [
    { name: '新竹', targets: ['新竹縣', '新竹市'] },
    { name: '嘉義', targets: ['嘉義縣', '嘉義市'] },
];

/**
 * 名稱去後綴：移除「縣」「市」「縣市」
 * 範例: "台北市" → "台北", "新北市" → "新北", "屏東縣" → "屏東"
 */
export const cleanName = (name) => name.replace(/[縣市]$|縣市$/, '');

/**
 * 將 TopoJSON topology 處理為 22 個行政區的 GeoJSON features。
 * 邏輯完全對應 docs/taiwan_geo_demo.html 中的 initMap()。
 */
export function processTopology(topology) {
    const countyObjects = topology.objects.counties.geometries;
    const mergedFeatures = [];
    const mergedNames = new Set();

    // 合併指定群組
    MERGE_GROUPS.forEach((group) => {
        const groupGeometries = countyObjects.filter((d) =>
            group.targets.includes(d.properties.COUNTYNAME)
        );
        if (groupGeometries.length > 0) {
            const mergedShape = merge(topology, groupGeometries);
            mergedShape.properties = { COUNTYNAME: group.name };
            mergedFeatures.push(mergedShape);
            group.targets.forEach((t) => mergedNames.add(t));
        }
    });

    // 取得其他不需要合併的縣市並清洗名稱
    const otherCounties = feature(topology, {
        type: 'GeometryCollection',
        geometries: countyObjects.filter(
            (d) => !mergedNames.has(d.properties.COUNTYNAME)
        ),
    }).features.map((f) => {
        f.properties.COUNTYNAME = cleanName(f.properties.COUNTYNAME);
        return f;
    });

    return [...otherCounties, ...mergedFeatures];
}

/**
 * Custom hook: 載入 taiwan-atlas TopoJSON 並處理為 22 個行政區 features。
 * 回傳 { features, loading, error }
 */
export default function useTaiwanMap() {
    const [features, setFeatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(MAP_URL);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const topology = await response.json();
                const processed = processTopology(topology);

                if (!cancelled) {
                    setFeatures(processed);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err.message);
                    setLoading(false);
                }
            }
        }

        load();
        return () => { cancelled = true; };
    }, []);

    return { features, loading, error };
}

/**
 * 22 個行政區的標準名稱集合（合併後、去後綴後）。
 * 用於 IncenseMapPage 匹配 mappedCandidates。
 */
export const REGION_NAMES = new Set([
    '台北', '新北', '桃園', '台中', '台南', '高雄',
    '基隆', '新竹', '嘉義', '宜蘭', '苗栗',
    '彰化', '南投', '雲林', '屏東', '花蓮', '台東',
    '澎湖', '金門', '連江',
]);
