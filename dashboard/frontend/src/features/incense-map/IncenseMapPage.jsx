import { useRef, useState, useEffect, useMemo } from 'react';
import { fetchIncenseCandidates } from '../../api/incenseMap';
import Navigation from '../../components/common/Navigation';

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
    const fileInputRef = useRef(null);

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

    const SortIcon = ({ col }) => {
        if (sortKey !== col) return <span className="text-gray-300 ml-1">↕</span>;
        return <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>;
    };

    const PageShell = ({ children }) => (
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

    if (loading) return (
        <PageShell>
            <div className="flex items-center justify-center h-64 text-white/70">載入中...</div>
        </PageShell>
    );
    if (error) return (
        <PageShell>
            <div className="flex items-center justify-center h-64 text-red-300">錯誤：{error}</div>
        </PageShell>
    );

    const displayTotal = mappedCandidates.reduce((s, c) => s + c.count, 0);
    const displayUnique = mappedCandidates.length;

    return (
        <PageShell>
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
                                詞彙 <SortIcon col="word" />
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('count')}
                            >
                                次數 <SortIcon col="count" />
                            </th>
                            <th
                                className="px-4 py-3 text-right cursor-pointer hover:text-indigo-600 select-none"
                                onClick={() => handleSort('percentage')}
                            >
                                比例 <SortIcon col="percentage" />
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
        </PageShell>
    );
}
