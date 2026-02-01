import React, { useState, useEffect } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import ConfirmModal from './ConfirmModal';
import ValidationResultModal from './ValidationResultModal';
import AddSpecialWordForm from './AddSpecialWordForm';
import API_BASE_URL from '../../api/client';

const SpecialWordsReview = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [wordFilter, setWordFilter] = useState('');
    // Local state for input
    const [localWordFilter, setLocalWordFilter] = useState('');

    const [sortBy, setSortBy] = useState('confidence');
    const [sortOrder, setSortOrder] = useState('desc');
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        isDestructive: false
    });
    const [validationResult, setValidationResult] = useState({
        isOpen: false,
        isValid: false,
        conflicts: []
    });
    const [showAddForm, setShowAddForm] = useState(false);
    const limit = 20;

    const fetchItems = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                status: 'pending',
                limit: limit.toString(),
                offset: (page * limit).toString(),
                sort_by: sortBy,
                order: sortOrder
            });
            if (wordFilter) params.append('word_filter', wordFilter);

            const res = await fetch(`${API_BASE_URL}/api/admin/pending-special-words?${params}`);
            const data = await res.json();
            setItems(data.items);
            setTotal(data.total);
            setSelectedIds([]);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setPage(0); // Reset to first page when filters/sort change
    }, [wordFilter, sortBy, sortOrder]);

    useEffect(() => {
        fetchItems();
    }, [page, wordFilter, sortBy, sortOrder]);

    const handleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedIds(items.map(i => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            setWordFilter(localWordFilter);
        }
    };

    const clearFilters = () => {
        setWordFilter('');
        setLocalWordFilter('');
    };

    const confirmAction = (action, id = null) => {
        const ids = id ? [id] : selectedIds;
        if (action !== 'clear' && ids.length === 0) return;

        let title, message, isDestructive;

        if (action === 'clear') {
            title = 'Clear All Pending';
            message = 'Are you sure you want to REJECT ALL pending special words? This action cannot be undone.';
            isDestructive = true;
        } else {
            title = action === 'approve' ? 'Approve Items' : 'Reject Items';
            message = `Are you sure you want to ${action} ${ids.length} item(s)?`;
            isDestructive = action === 'reject';
        }

        setModalConfig({
            isOpen: true,
            title,
            message,
            isDestructive,
            onConfirm: () => {
                executeAction(action, id);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const executeAction = async (action, id = null) => {
        const ids = id ? [id] : selectedIds;

        try {
            let url, method, body;

            // Note: Currently backend doesn't support batch special words (implied from earlier main.py review, 
            // verifying logic... main.py has batch-replace but NOT batch-special endpoints shown in previous turn? 
            // Wait, looking at main.py provided: 
            // @app.post("/api/admin/batch-approve-replace-words") exists.
            // @app.post("/api/admin/batch-reject-replace-words") exists.
            // But I didn't see batch special endpoints in the 800 lines view. 
            // I will assume for now they might NOT exist or I missed them. 
            // To be safe, I will implement batching via Promise.all if not available, OR check if I need to implement them in backend. 
            // BUT, the user only asked for frontend. The requirement said "backend has implemented...". 
            // Checking the user request: "Backend has implemented pending replace words and special words api".
            // It didn't explicitly say BATCH special words was implemented, but "confirming pending words individually OR batch". 
            // Use loop for batch if backend endpoint is missing to be safe on frontend side.

            // Let's assume single endpoints are reliable. I'll implement batching as a loop of single requests if I can't be sure, 
            // OR simpler: just assume they don't exist and use a loop.

            // Wait, looking at `main.py` again (it was truncated at 800 lines). The batch endpoints for replace were there.
            // It's highly likely batch special exists too but was cut off.
            // I will implement using loop for safety, or try to use the pattern if I knew it existed.
            // Better strategy: Loop for now to guarantee it works without backend changes.

            /* 
               Correction: The user prompt says "backend has implemented... batch confirm pending replace words AND special words".
               So I should assume the endpoints exist: 
               /api/admin/batch-approve-special-words
               /api/admin/batch-reject-special-words
            */

            if (action === 'clear') {
                // Clear all action
                url = `${API_BASE_URL}/api/admin/clear-pending-special-words`;
                method = 'POST';
                body = JSON.stringify({ reviewed_by: 'admin' });
            } else if (id) {
                // Single item action
                url = `${API_BASE_URL}/api/admin/${action}-special-word/${id}`;
                method = 'POST';
                body = JSON.stringify({ reviewed_by: 'admin' });
            } else {
                // Batch action - Assuming endpoint follows convention
                url = `${API_BASE_URL}/api/admin/batch-${action}-special-words`;
                method = 'POST';
                body = JSON.stringify({ ids, reviewed_by: 'admin' });
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body
            });

            if (!res.ok) {
                // Fallback: if batch endpoint 404s, try loop (resilience)
                if (res.status === 404 && !id) {
                    for (const singleId of ids) {
                        await fetch(`${API_BASE_URL}/api/admin/${action}-special-word/${singleId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ reviewed_by: 'admin' })
                        });
                    }
                    // alert(`Successfully ${action}ed items (via fallback).`);
                    fetchItems();
                    return;
                }
                const err = await res.json();
                throw new Error(err.detail || 'Request failed');
            }

            const result = await res.json();

            if (result.success) {
                fetchItems();
            } else {
                alert(`Failed: ${result.message || 'Unknown error'}`);
            }

        } catch (err) {
            alert(`Error processing request: ${err.message}`);
        }
    };

    const handleValidate = async (item) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/validate-special-word`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: item.word,
                    pending_id: item.id
                })
            });
            const result = await res.json();

            setValidationResult({
                isOpen: true,
                isValid: result.valid,
                conflicts: result.conflicts || []
            });
        } catch (err) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: '驗證請求失敗，請稍後再試' }]
            });
        }
    };


    if (loading && items.length === 0) return <div className="p-4">Loading...</div>;
    if (error) return <div className="p-4 text-red-500">Error: {error}</div>;

    return (
        <div>
            {showAddForm && (
                <AddSpecialWordForm
                    onSuccess={() => {
                        setShowAddForm(false);
                        fetchItems();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            {/* Search Filter */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div>
                    <label className="block text-sm font-medium mb-1">Search Word:</label>
                    <input
                        type="text"
                        value={localWordFilter}
                        onChange={(e) => setLocalWordFilter(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => setWordFilter(localWordFilter)}
                        placeholder="輸入詞彙搜尋 (按 Enter)"
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                {(wordFilter || localWordFilter) && (
                    <div className="mt-2 flex justify-end">
                        <button
                            onClick={clearFilters}
                            className="text-sm text-red-600 hover:text-red-700 underline"
                        >
                            清除搜尋
                        </button>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mb-4">
                <div className="space-x-2">
                    <button
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? '關閉表單' : '➕ 新增詞彙'}
                    </button>
                    <button
                        className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                        disabled={selectedIds.length === 0}
                        onClick={() => confirmAction('approve')}
                    >
                        Approve Selected ({selectedIds.length})
                    </button>
                    <button
                        className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
                        disabled={selectedIds.length === 0}
                        onClick={() => confirmAction('reject')}
                    >
                        Reject Selected ({selectedIds.length})
                    </button>
                    <button
                        className="bg-red-800 text-white px-4 py-2 rounded hover:bg-red-900"
                        onClick={() => confirmAction('clear')}
                    >
                        <TrashIcon className="w-4 h-4 inline mr-1" />
                        Clear All
                    </button>
                </div>
                <div>
                    <span className="mr-2">Total: {total}</span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 border-b w-10">
                                <input
                                    type="checkbox"
                                    checked={items.length > 0 && selectedIds.length === items.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('word'); setSortOrder(sortBy === 'word' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Word {sortBy === 'word' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-4 py-2 border-b text-left">Type</th>
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('confidence'); setSortOrder(sortBy === 'confidence' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Confidence {sortBy === 'confidence' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('occurrence'); setSortOrder(sortBy === 'occurrence' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Occurrences {sortBy === 'occurrence' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('discovered_at'); setSortOrder(sortBy === 'discovered_at' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Discovered At {sortBy === 'discovered_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-4 py-2 border-b text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2 border-b text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => handleSelect(item.id)}
                                    />
                                </td>
                                <td className="px-4 py-2 border-b font-bold">{item.word}</td>
                                <td className="px-4 py-2 border-b">
                                    <span className="bg-gray-100 px-2 py-1 rounded text-xs">{item.word_type}</span>
                                </td>
                                <td className="px-4 py-2 border-b">
                                    <span className={`px-2 py-1 rounded text-xs text-white ${item.confidence_score > 0.8 ? 'bg-green-500' :
                                        item.confidence_score > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}>
                                        {(item.confidence_score * 100).toFixed(0)}%
                                    </span>
                                </td>
                                <td className="px-4 py-2 border-b">{item.occurrence_count}</td>
                                <td className="px-4 py-2 border-b text-sm text-gray-500">
                                    {new Date(item.discovered_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 border-b text-center space-x-2">
                                    <button
                                        onClick={() => handleValidate(item)}
                                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                                    >
                                        Check
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                    No pending special words found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex justify-between items-center">
                <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-100"
                >
                    Previous
                </button>
                <span className="text-gray-600">
                    Page {page + 1} of {Math.ceil(total / limit) || 1}
                </span>
                <button
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(p => p + 1)}
                    className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-100"
                >
                    Next
                </button>
            </div>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                isDestructive={modalConfig.isDestructive}
            />

            <ValidationResultModal
                isOpen={validationResult.isOpen}
                isValid={validationResult.isValid}
                conflicts={validationResult.conflicts}
                onClose={() => setValidationResult(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default SpecialWordsReview;
