import { useRef, useState, useEffect, useMemo } from 'react';
import { fetchIncenseCandidates } from '../../api/incenseMap';

export default function IncenseMapPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sortKey, setSortKey] = useState('count');
    const [sortAsc, setSortAsc] = useState(false);
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [mapping, setMapping] = useState(null);       // { original: mapped }
    const [mappingName, setMappingName] = useState(''); // uploaded filename
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
                setMapping(parsed);
                setMappingName(file.name);
                setMappingError('');
            } catch (err) {
                setMappingError(err.message);
                setMapping(null);
                setMappingName('');
            }
        };
        reader.readAsText(file, 'utf-8');
        // reset input so same file can be re-uploaded
        e.target.value = '';
    };

    const clearMapping = () => {
        setMapping(null);
        setMappingName('');
        setMappingError('');
    };

    // Apply mapping + aggregate counts
    const mappedCandidates = useMemo(() => {
        if (!data) return [];
        if (!mapping) return data.candidates;

        const grouped = {};
        for (const { word, count } of data.candidates) {
            const target = mapping[word] ?? word;
            grouped[target] = (grouped[target] ?? 0) + count;
        }
        const total = Object.values(grouped).reduce((a, b) => a + b, 0);
        return Object.entries(grouped).map(([word, count]) => ({
            word,
            count,
            percentage: total > 0 ? Math.round(count / total * 10000) / 100 : 0,
        }));
    }, [data, mapping]);

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

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-gray-500">載入中...</div>
    );
    if (error) return (
        <div className="flex items-center justify-center h-64 text-red-500">錯誤：{error}</div>
    );

    const displayTotal = mappedCandidates.reduce((s, c) => s + c.count, 0);
    const displayUnique = mappedCandidates.length;

    return (
        <div className="max-w-3xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-1">地區上香分布</h1>
            <p className="text-sm text-gray-500 mb-4">
                共 {displayTotal.toLocaleString()} 則上香訊息，{displayUnique} 個候選詞
                {mapping && <span className="ml-2 text-indigo-500">（已套用 mapping）</span>}
            </p>

            {/* 時間 filter */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <input
                    type="datetime-local"
                    step="3600"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <span className="text-gray-400">→</span>
                <input
                    type="datetime-local"
                    step="3600"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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

            {/* Mapping 上傳 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
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
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                >
                    上傳 Mapping JSON
                </button>
                {mappingName && (
                    <>
                        <span className="text-sm text-indigo-600 font-medium">{mappingName}</span>
                        <button
                            onClick={clearMapping}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                            aria-label="清除 mapping"
                        >
                            ✕ 清除
                        </button>
                    </>
                )}
                {mappingError && (
                    <span className="text-sm text-red-500">{mappingError}</span>
                )}
            </div>

            {/* 搜尋 + 下載 */}
            <div className="flex justify-between items-center mb-4">
                <input
                    type="text"
                    placeholder="搜尋詞彙..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full mr-3 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                    onClick={handleDownload}
                    disabled={sorted.length === 0}
                    className="shrink-0 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                >
                    ↓ 下載
                </button>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 font-semibold">
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
                    <tbody className="divide-y divide-gray-100">
                        {sorted.map((c, i) => (
                            <tr key={c.word} className="hover:bg-indigo-50 transition-colors">
                                <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                                <td className="px-4 py-2 font-medium text-gray-800">{c.word}</td>
                                <td className="px-4 py-2 text-right text-gray-700">
                                    {c.count.toLocaleString()}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-500">
                                    {c.percentage}%
                                </td>
                            </tr>
                        ))}
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                                    找不到符合的詞彙
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
