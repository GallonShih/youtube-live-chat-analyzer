import { useState, useEffect, useMemo } from 'react';
import { feature } from 'topojson-client';

const WORLD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ── 模組層快取 — 只下載一次 ────────────────────────────────────
let cachedFeatures = null;
let cachedAllCountries = null;
let loadPromise = null;

/**
 * 載入 world-atlas TopoJSON，解析為 GeoJSON features 並快取。
 * 同時產出 allCountries 選項列表（{id, en}，按英文名排序）。
 */
async function loadWorld() {
    if (cachedFeatures) return { features: cachedFeatures, allCountries: cachedAllCountries };
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const res = await fetch(WORLD_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const topology = await res.json();
        cachedFeatures = feature(topology, topology.objects.countries).features;

        // 產出 { id, en } 清單，按英文名排序
        cachedAllCountries = cachedFeatures
            .map((f) => ({ id: f.id, en: f.properties.name }))
            .filter((c) => c.en) // 排除沒有名稱的
            .sort((a, b) => a.en.localeCompare(b.en));

        return { features: cachedFeatures, allCountries: cachedAllCountries };
    })();

    return loadPromise;
}

/**
 * Custom hook: 載入 world-atlas 所有國家。
 *
 * @param {Array<{name: string, label: string, matchKey: string}>} selectedCountries
 *   - name: 國家英文名（world-atlas properties.name），唯一識別碼
 *   - label: 顯示在 inset 卡片上的名稱（使用者可自訂）
 *   - matchKey: 用來和上香 message 匹配的名稱（使用者可自訂）
 *
 * @returns {{
 *   allCountries: Array<{id: string, en: string}>,
 *   countryFeatures: Array<{name: string, label: string, matchKey: string, feature: object}>,
 *   loading: boolean,
 *   error: string|null
 * }}
 */
export default function useWorldCountries(selectedCountries = []) {
    const [allFeatures, setAllFeatures] = useState(cachedFeatures || []);
    const [allCountries, setAllCountries] = useState(cachedAllCountries || []);
    const [loading, setLoading] = useState(!cachedFeatures);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (cachedFeatures) {
            setAllFeatures(cachedFeatures);
            setAllCountries(cachedAllCountries);
            setLoading(false);
            return;
        }

        let cancelled = false;
        loadWorld()
            .then(({ features, allCountries: ac }) => {
                if (!cancelled) {
                    setAllFeatures(features);
                    setAllCountries(ac);
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

    // 為每個 selectedCountry 查找 GeoJSON feature（by name === properties.name）
    const countryFeatures = useMemo(() => {
        if (allFeatures.length === 0) return [];
        return selectedCountries
            .map((c) => {
                const ft = allFeatures.find((f) => f.properties.name === c.name) ?? null;
                return ft ? { name: c.name, label: c.label, matchKey: c.matchKey, feature: ft } : null;
            })
            .filter(Boolean);
    }, [allFeatures, selectedCountries]);

    return { allCountries, countryFeatures, loading, error };
}
