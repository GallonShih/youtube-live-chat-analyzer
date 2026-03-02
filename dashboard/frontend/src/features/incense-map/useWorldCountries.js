import { useState, useEffect, useCallback } from 'react';
import { feature } from 'topojson-client';

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

/**
 * 常見國家對照表：中文名稱 → ISO 3166-1 numeric code (string)
 * 用於使用者輸入中文國名後查找 world-atlas 中的 feature。
 * world-atlas 的 country.id 是三位數字字串 (e.g. "392" = Japan)
 * country.properties.name 是英文名稱 (e.g. "Japan")
 */
export const COUNTRY_NAME_MAP = {
    // 東亞
    日本: { code: '392', en: 'Japan' },
    韓國: { code: '410', en: 'South Korea' },
    北韓: { code: '408', en: 'North Korea' },
    中國: { code: '156', en: 'China' },
    蒙古: { code: '496', en: 'Mongolia' },
    // 東南亞
    越南: { code: '704', en: 'Vietnam' },
    泰國: { code: '764', en: 'Thailand' },
    菲律賓: { code: '608', en: 'Philippines' },
    馬來西亞: { code: '458', en: 'Malaysia' },
    印尼: { code: '360', en: 'Indonesia' },
    新加坡: { code: '702', en: 'Singapore' },
    緬甸: { code: '104', en: 'Myanmar' },
    柬埔寨: { code: '116', en: 'Cambodia' },
    // 南亞 / 中亞
    印度: { code: '356', en: 'India' },
    巴基斯坦: { code: '586', en: 'Pakistan' },
    // 西亞
    土耳其: { code: '792', en: 'Turkey' },
    以色列: { code: '376', en: 'Israel' },
    沙烏地阿拉伯: { code: '682', en: 'Saudi Arabia' },
    // 歐洲
    英國: { code: '826', en: 'United Kingdom' },
    法國: { code: '250', en: 'France' },
    德國: { code: '276', en: 'Germany' },
    義大利: { code: '380', en: 'Italy' },
    西班牙: { code: '724', en: 'Spain' },
    荷蘭: { code: '528', en: 'Netherlands' },
    瑞士: { code: '756', en: 'Switzerland' },
    瑞典: { code: '752', en: 'Sweden' },
    烏克蘭: { code: '804', en: 'Ukraine' },
    波蘭: { code: '616', en: 'Poland' },
    俄羅斯: { code: '643', en: 'Russia' },
    // 美洲
    美國: { code: '840', en: 'United States of America' },
    加拿大: { code: '124', en: 'Canada' },
    巴西: { code: '076', en: 'Brazil' },
    墨西哥: { code: '484', en: 'Mexico' },
    阿根廷: { code: '032', en: 'Argentina' },
    // 大洋洲
    澳洲: { code: '036', en: 'Australia' },
    紐西蘭: { code: '554', en: 'New Zealand' },
    // 非洲
    南非: { code: '710', en: 'South Africa' },
    埃及: { code: '818', en: 'Egypt' },
    奈及利亞: { code: '566', en: 'Nigeria' },
};

/** 所有可選國家的中文名稱列表（排序後） */
export const COUNTRY_OPTIONS = Object.keys(COUNTRY_NAME_MAP).sort();

// 模組層快取 — 只下載一次
let cachedTopology = null;
let cachedFeatures = null;
let loadPromise = null;

/**
 * 載入 world-atlas TopoJSON 並快取。
 * 回傳所有國家的 GeoJSON features 陣列。
 */
async function loadWorld() {
    if (cachedFeatures) return cachedFeatures;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const res = await fetch(WORLD_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cachedTopology = await res.json();
        cachedFeatures = feature(cachedTopology, cachedTopology.objects.countries).features;
        return cachedFeatures;
    })();

    return loadPromise;
}

/**
 * Custom hook: 根據國家中文名稱列表，從 world-atlas 取得對應的 GeoJSON features。
 *
 * @param {string[]} countryNames - 中文國家名稱陣列，如 ['日本', '韓國']
 * @returns {{ countryFeatures: Array<{name: string, feature: object}>, loading: boolean, error: string|null }}
 */
export default function useWorldCountries(countryNames) {
    const [allFeatures, setAllFeatures] = useState(cachedFeatures || []);
    const [loading, setLoading] = useState(!cachedFeatures);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (cachedFeatures) {
            setAllFeatures(cachedFeatures);
            setLoading(false);
            return;
        }

        let cancelled = false;
        loadWorld()
            .then((features) => {
                if (!cancelled) {
                    setAllFeatures(features);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err.message);
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, []);

    /**
     * 依中文名稱查找對應 feature。
     * 先用 COUNTRY_NAME_MAP 查 code → 再從 features 找 id === code
     */
    const findFeature = useCallback(
        (zhName) => {
            const info = COUNTRY_NAME_MAP[zhName];
            if (!info || allFeatures.length === 0) return null;
            return allFeatures.find((f) => f.id === info.code) ?? null;
        },
        [allFeatures]
    );

    // 計算每個國家的 feature（只有 countryNames 或 allFeatures 變動時才重算）
    const countryFeatures = countryNames
        .map((name) => ({ name, feature: findFeature(name) }))
        .filter((cf) => cf.feature !== null);

    return { countryFeatures, loading, error };
}
