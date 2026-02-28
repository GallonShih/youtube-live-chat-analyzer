import { useState, useEffect, useMemo } from 'react';
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

    const sorted = useMemo(() => {
        if (!data) return [];
        let list = data.candidates.filter(c =>
            search === '' || c.word.includes(search)
        );
        list = [...list].sort((a, b) => {
            const av = a[sortKey], bv = b[sortKey];
            if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
            return sortAsc ? av - bv : bv - av;
        });
        return list;
    }, [data, sortKey, sortAsc, search]);

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

    return (
        <div className="max-w-3xl mx-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-1">地區上香分布</h1>
            <p className="text-sm text-gray-500 mb-4">
                共 {data.total_matched.toLocaleString()} 則上香訊息，{data.unique_candidates} 個候選詞
            </p>

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

            <input
                type="text"
                placeholder="搜尋詞彙..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="mb-4 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />

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
