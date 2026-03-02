import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { fetchIncenseCandidates } from '../../api/incenseMap';
import Navigation from '../../components/common/Navigation';
import TaiwanMap from './TaiwanMap';
import { REGION_NAMES } from './useTaiwanMap';
import { COUNTRY_NAME_MAP, COUNTRY_OPTIONS } from './useWorldCountries';

/** 非地理區域的上香對象（遊戲/品牌）預設清單 */
const DEFAULT_BRANDS = [
    { name: '逆水寒', logo: null },
    { name: '傳說對決', logo: null },
    { name: '格力變頻空調', logo: null },
];

// 對一組 candidates 套用單一 mapping，回傳合併後的新 candidates
function applyOneMapping(candidates, map) {
    const grouped = {};
    for (const { word, count } of candidates) {
        const target = map[word] ?? word;
        grouped[target] = (grouped[target] ?? 0) + count;
    }
    const total = Object.values(grouped).reduce((a, b) => a + b, 0);
    return Object.entries(grouped).map(([word, count]) => ({
        word,
        count,
        percentage: total > 0 ? Math.round(count / total * 10000) / 100 : 0,
    }));
}

// 將 PageShell 提取到組件外部，避免每次 re-render 重建 function reference 導致子樹 unmount
function PageShell({ children }) {
    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="flex justify-between items-center mb-6 relative">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        地區上香分布
                    </h1>
                    <Navigation />
                </header>
                {children}
            </div>
        </div>
    );
}

export default function IncenseMapPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortKey, setSortKey] = useState('count');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    // [{ name: string, map: object }]
    const [mappings, setMappings] = useState([]);
    const [mappingError, setMappingError] = useState('');
    const [activeTab, setActiveTab] = useState('table');
    const fileInputRef = useRef(null);

    // 動態品牌清單
    const [brands, setBrands] = useState(DEFAULT_BRANDS);
    const brandNames = useMemo(() => new Set(brands.map((b) => b.name)), [brands]);

    // 新增品牌 Modal
    const [showBrandModal, setShowBrandModal] = useState(false);
    const [brandModalInput, setBrandModalInput] = useState('');
    const [brandModalError, setBrandModalError] = useState('');
    const brandModalInputRef = useRef(null);

    // 動態國家清單
    const [countries, setCountries] = useState([]);
    const countryNames = useMemo(() => new Set(countries.map((c) => c.name)), [countries]);

    // 新增國家 Modal
    const [showCountryModal, setShowCountryModal] = useState(false);
    const [countryModalInput, setCountryModalInput] = useState('');
    const [countryModalError, setCountryModalError] = useState('');

    const openBrandModal = useCallback(() => {
        setBrandModalInput('');
        setBrandModalError('');
        setShowBrandModal(true);
        // 延遲 focus 讓 modal 渲染後再取得焦點
        setTimeout(() => brandModalInputRef.current?.focus(), 50);
    }, []);

    const closeBrandModal = useCallback(() => {
        setShowBrandModal(false);
        setBrandModalInput('');
        setBrandModalError('');
    }, []);

    const openCountryModal = useCallback(() => {
        setCountryModalInput('');
        setCountryModalError('');
        setShowCountryModal(true);
    }, []);

    const closeCountryModal = useCallback(() => {
        setShowCountryModal(false);
        setCountryModalInput('');
        setCountryModalError('');
    }, []);

    const confirmAddCountry = useCallback(() => {
        const name = countryModalInput.trim();
        if (!name) {
            setCountryModalError('請選擇或輸入國家名稱');
            return;
        }
        if (!COUNTRY_NAME_MAP[name]) {
            setCountryModalError('不支援的國家名稱，請從下拉選單選擇');
            return;
        }
        if (countries.some((c) => c.name === name)) {
            setCountryModalError('此國家已存在');
            return;
        }
        setCountries((prev) => [...prev, { name }]);
        closeCountryModal();
    }, [countryModalInput, countries, closeCountryModal]);

    const removeCountry = useCallback((name) => {
        setCountries((prev) => prev.filter((c) => c.name !== name));
    }, []);

    const confirmAddBrand = useCallback(() => {
        const name = brandModalInput.trim();
        if (!name) {
            setBrandModalError('請輸入品牌名稱');
            return;
        }
        if (brands.some((b) => b.name === name)) {
            setBrandModalError('此品牌已存在');
            return;
        }
        setBrands((prev) => [...prev, { name, logo: null }]);
        closeBrandModal();
    }, [brandModalInput, brands, closeBrandModal]);

    const removeBrand = useCallback((name) => {
        setBrands((prev) => prev.filter((b) => b.name !== name));
    }, []);

    const load = (start, end) => {
        setLoading(true);
        setError(null);
        fetchIncenseCandidates({
            startTime: start || undefined,
            endTime: end || undefined,
        })
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load('', ''); }, []);

    const handleMappingUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (typeof parsed !== 'object' || Array.isArray(parsed))
                    throw new Error('JSON 格式錯誤：需為 key-value 物件');
                setMappings(prev => [...prev, { name: file.name, map: parsed }]);
                setMappingError('');
            } catch (err) {
                setMappingError(err.message);
            }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const removeMapping = (index) => {
        setMappings(prev => prev.filter((_, i) => i !== index));
    };

    const clearAllMappings = () => {
        setMappings([]);
        setMappingError('');
    };

    // 依序套用每一層 mapping
    const mappedCandidates = useMemo(() => {
        if (!data) return [];
        if (mappings.length === 0) return data.candidates;
        return mappings.reduce(
            (candidates, { map }) => applyOneMapping(candidates, map),
            data.candidates
        );
    }, [data, mappings]);

    // 將 mappedCandidates 中匹配行政區或品牌名稱的詞彙轉為 regionData
    const regionData = useMemo(() => {
        const result = {};
        for (const { word, count, percentage } of mappedCandidates) {
            const normalized = word.replace(/臺/g, '台');
            if (REGION_NAMES.has(normalized) || brandNames.has(normalized) || countryNames.has(normalized)) {
                result[normalized] = { count, percentage };
            }
        }
        return result;
    }, [mappedCandidates, brandNames, countryNames]);

    const sorted = useMemo(() => {
        let list = mappedCandidates.filter(c =>
            search === '' || c.word.includes(search)
        );
        list = [...list].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortAsc ? av - bv : bv - av;
        });
        return list;
    }, [mappedCandidates, sortKey, sortAsc, search]);

    const handleDownload = () => {
        const text = sorted.map(c => c.word).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'incense_words.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSort = (key) => {
        if (sortKey === key) setSortAsc(v => !v);
        else { setSortKey(key); setSortAsc(false); }
    };

    const sortIcon = (col) => {
        if (sortKey !== col) return '↕';
        return sortAsc ? '↑' : '↓';
    };

    if (loading) return (
        <PageShell>
            <div className="flex items-center justify-center h-64 text-white/70">載入中...</div>
        </PageShell>
    );

    const displayTotal = mappedCandidates.reduce((s, c) => s + c.count, 0);
    const displayUnique = mappedCandidates.length;

    return (
        <PageShell>
            {/* API 錯誤提示（不阻擋頁面） */}
            {error && (
                <div className="glass-card p-3 rounded-2xl mb-4 border border-red-400/30 bg-red-500/10">
                    <p className="text-sm text-red-300">
                        ⚠ 資料載入失敗：{error}
                        <button
                            onClick={() => load(startDate, endDate)}
                            className="ml-3 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 px-2 py-0.5 rounded transition-colors"
                        >
                            重試
                        </button>
                    </p>
                </div>
            )}

            {/* 摘要 */}
            <p className="text-sm text-white/70 mb-4">
                共 {displayTotal.toLocaleString()} 則上香訊息，{displayUnique} 個候選詞
                {mappings.length > 0 && (
                    <span className="ml-2 text-purple-200">（已套用 {mappings.length} 層 mapping）</span>
                )}
            </p>

            {/* 時間 filter */}
            <div className="glass-card p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <input
                        type="datetime-local"
                        step="3600"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 flex-1 sm:flex-none min-w-0"
                    />
                    <span className="text-gray-500">→</span>
                    <input
                        type="datetime-local"
                        step="3600"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 flex-1 sm:flex-none min-w-0"
                    />
                    <button
                        onClick={() => load(startDate, endDate)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                        套用
                    </button>
                    <button
                        onClick={() => { setStartDate(''); setEndDate(''); load('', ''); }}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                    >
                        全部
                    </button>
                </div>
            </div>

            {/* Mapping 上傳區 */}
            <div className="glass-card p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleMappingUpload}
                        className="hidden"
                        aria-label="上傳 mapping JSON"
                    />
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="bg-white/70 hover:bg-white/90 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-gray-300"
                    >
                        + 新增 Mapping JSON
                    </button>
                    {mappings.length > 1 && (
                        <button
                            onClick={clearAllMappings}
                            className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                            aria-label="清除所有 mapping"
                        >
                            全部清除
                        </button>
                    )}
                    {mappingError && (
                        <span className="text-sm text-red-500">{mappingError}</span>
                    )}
                </div>

                {/* mapping 清單 */}
                {mappings.length > 0 && (
                    <ol className="flex flex-col gap-1 mt-1">
                        {mappings.map(({ name }, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                                <span className="text-indigo-700 font-medium">{name}</span>
                                <button
                                    onClick={() => removeMapping(i)}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
                                    aria-label={`移除 mapping ${i + 1}`}
                                >
                                    ✕
                                </button>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            {/* Tab 切換 */}
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

            {/* 地圖 Tab */}
            {activeTab === 'map' && (
                <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-sm text-white/70">品牌卡片：</span>
                    {brands.map((b) => (
                        <span
                            key={b.name}
                            className="inline-flex items-center gap-1 bg-white/10 text-white text-xs px-2 py-1 rounded-full"
                        >
                            {b.name}
                            <button
                                onClick={() => removeBrand(b.name)}
                                className="ml-0.5 text-white/50 hover:text-red-300 leading-none"
                                aria-label={`移除品牌 ${b.name}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    <button
                        onClick={openBrandModal}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-indigo-600/80 text-white hover:bg-indigo-500 transition-colors"
                    >
                        ＋ 新增品牌
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-sm text-white/70">國家地圖：</span>
                    {countries.map((c) => (
                        <span
                            key={c.name}
                            className="inline-flex items-center gap-1 bg-white/10 text-white text-xs px-2 py-1 rounded-full"
                        >
                            {c.name}
                            <button
                                onClick={() => removeCountry(c.name)}
                                className="ml-0.5 text-white/50 hover:text-red-300 leading-none"
                                aria-label={`移除國家 ${c.name}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    <button
                        onClick={openCountryModal}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-600/80 text-white hover:bg-emerald-500 transition-colors"
                    >
                        ＋ 新增國家
                    </button>
                </div>

                <TaiwanMap regionData={regionData} brands={brands} countries={countries} />
                </>
            )}

            {/* 新增品牌 Modal — 獨立於地圖渲染，避免 modal state 導致地圖重繪 */}
            {showBrandModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={(e) => { if (e.target === e.currentTarget) closeBrandModal(); }}
                    data-testid="brand-modal-overlay"
                >
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" data-testid="brand-modal">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">新增品牌</h3>
                        <label className="block text-sm font-medium text-gray-600 mb-1">品牌名稱</label>
                        <input
                            ref={brandModalInputRef}
                            type="text"
                            value={brandModalInput}
                            onChange={(e) => { setBrandModalInput(e.target.value); setBrandModalError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmAddBrand(); } }}
                            placeholder="例如：原神、星穹鐵道..."
                            className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                            aria-label="品牌名稱"
                        />
                        {brandModalError && (
                            <p className="text-xs text-red-500 mt-1">{brandModalError}</p>
                        )}
                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                onClick={closeBrandModal}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmAddBrand}
                                disabled={!brandModalInput.trim()}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                確認新增
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 新增國家 Modal */}
            {showCountryModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={(e) => { if (e.target === e.currentTarget) closeCountryModal(); }}
                    data-testid="country-modal-overlay"
                >
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" data-testid="country-modal">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">新增國家</h3>
                        <label className="block text-sm font-medium text-gray-600 mb-1">國家名稱</label>
                        <select
                            value={countryModalInput}
                            onChange={(e) => { setCountryModalInput(e.target.value); setCountryModalError(''); }}
                            className="w-full px-3 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                            aria-label="國家名稱"
                        >
                            <option value="">請選擇國家...</option>
                            {COUNTRY_OPTIONS.map((name) => (
                                <option key={name} value={name}>{name} ({COUNTRY_NAME_MAP[name].en})</option>
                            ))}
                        </select>
                        {countryModalError && (
                            <p className="text-xs text-red-500 mt-1">{countryModalError}</p>
                        )}
                        <div className="flex justify-end gap-2 mt-5">
                            <button
                                onClick={closeCountryModal}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmAddCountry}
                                disabled={!countryModalInput}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                確認新增
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 表格 Tab */}
            {activeTab === 'table' && (
            <>
            {/* 搜尋 + 下載 */}
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="搜尋詞彙..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white/80 border border-white/50 text-gray-700 placeholder-gray-400"
                />
                <button
                    onClick={handleDownload}
                    disabled={sorted.length === 0}
                    className="shrink-0 bg-white/80 hover:bg-white disabled:opacity-40 text-gray-700 border border-white/50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                    ↓ 下載
                </button>
            </div>

            {/* 表格 */}
            <div className="glass-card rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-white/30 text-gray-700 font-semibold">
                        <tr>
                            <th className="px-4 py-3 text-left w-12">#</th>
                            <th
                                className="px-4 py-3 text-left cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('word')}
                            >
                                詞彙 <span className="ml-1">{sortIcon('word')}</span>
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('count')}
                            >
                                次數 <span className="ml-1">{sortIcon('count')}</span>
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('percentage')}
                            >
                                比例 <span className="ml-1">{sortIcon('percentage')}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/20">
                        {sorted.map((c, i) => (
                            <tr key={c.word} className="hover:bg-white/20 transition-colors">
                                <td className="px-4 py-2.5 text-gray-500">{i + 1}</td>
                                <td className="px-4 py-2.5 font-medium text-gray-800">{c.word}</td>
                                <td className="px-4 py-2.5 text-right text-gray-700">
                                    {c.count.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-600">
                                    {c.percentage}%
                                </td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                                    找不到符合的詞彙
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            </>
            )}
        </PageShell>
    );
}
