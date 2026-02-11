import React, { useState, useEffect, useRef, useCallback } from 'react';
import API_BASE_URL, { authFetch } from '../../api/client';

const ActiveDictionary = () => {
    const [subView, setSubView] = useState('replace');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const [localSearch, setLocalSearch] = useState('');
    const limit = 20;
    const fetchKey = useRef(0);

    const fetchItems = useCallback(async (overridePage) => {
        const currentKey = ++fetchKey.current;
        setLoading(true);
        try {
            const endpoint = subView === 'replace' ? 'active-replace-words' : 'active-special-words';
            const actualPage = overridePage !== undefined ? overridePage : page;
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: (actualPage * limit).toString(),
            });
            if (search) params.append('search', search);

            const res = await authFetch(`${API_BASE_URL}/api/admin/${endpoint}?${params}`);
            if (fetchKey.current !== currentKey) return;
            const data = await res.json();
            setItems(data.items);
            setTotal(data.total);
        } catch (err) {
            console.error('Failed to fetch dictionary:', err);
        } finally {
            if (fetchKey.current === currentKey) setLoading(false);
        }
    }, [subView, search, page]);

    useEffect(() => {
        if (page !== 0) {
            setPage(0);
        } else {
            fetchItems(0);
        }
    }, [search, subView]);

    useEffect(() => {
        fetchItems();
    }, [page]);

    const applySearch = () => {
        setSearch(localSearch);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') applySearch();
    };

    const totalPages = Math.ceil(total / limit);

    const formatDate = (isoStr) => {
        if (!isoStr) return '-';
        const d = new Date(isoStr);
        return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    return (
        <div>
            {/* Sub-view toggle */}
            <div className="flex items-center gap-4 mb-4">
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                    <button
                        className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${subView === 'replace'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        onClick={() => setSubView('replace')}
                    >
                        Replace Words
                    </button>
                    <button
                        className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${subView === 'special'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        onClick={() => setSubView('special')}
                    >
                        Special Words
                    </button>
                </div>
                <span className="text-sm text-gray-500">
                    {total} word{total !== 1 ? 's' : ''} total
                </span>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={subView === 'replace' ? 'Search source or target word...' : 'Search word...'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    onClick={applySearch}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 cursor-pointer transition-colors"
                >
                    Search
                </button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    {search ? 'No matches found.' : 'Dictionary is empty.'}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200">
                                {subView === 'replace' ? (
                                    <>
                                        <th className="text-left py-3 px-4 font-medium text-gray-600">Source</th>
                                        <th className="text-left py-3 px-4 font-medium text-gray-600">Target</th>
                                    </>
                                ) : (
                                    <th className="text-left py-3 px-4 font-medium text-gray-600">Word</th>
                                )}
                                <th className="text-left py-3 px-4 font-medium text-gray-600">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    {subView === 'replace' ? (
                                        <>
                                            <td className="py-3 px-4 font-mono">{item.source_word}</td>
                                            <td className="py-3 px-4 font-mono">
                                                <span className="text-gray-400 mr-1">&rarr;</span>
                                                {item.target_word}
                                            </td>
                                        </>
                                    ) : (
                                        <td className="py-3 px-4 font-mono">{item.word}</td>
                                    )}
                                    <td className="py-3 px-4 text-gray-500">{formatDate(item.created_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                    <span className="text-sm text-gray-500">
                        Page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer transition-colors disabled:cursor-default"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 cursor-pointer transition-colors disabled:cursor-default"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActiveDictionary;
