import React, { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import ValidationResultModal from './ValidationResultModal';
import AddReplaceWordForm from './AddReplaceWordForm';

const API_BASE_URL = 'http://localhost:8000';

const ReplaceWordsReview = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [sourceWordFilter, setSourceWordFilter] = useState('');
    const [targetWordFilter, setTargetWordFilter] = useState('');
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
            if (sourceWordFilter) params.append('source_word_filter', sourceWordFilter);
            if (targetWordFilter) params.append('target_word_filter', targetWordFilter);

            const res = await fetch(`${API_BASE_URL}/api/admin/pending-replace-words?${params}`);
            const data = await res.json();
            setItems(data.items);
            setTotal(data.total);
            setSelectedIds([]); // Reset selection on page change or refresh
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setPage(0); // Reset to first page when filters/sort change
    }, [sourceWordFilter, targetWordFilter, sortBy, sortOrder]);

    useEffect(() => {
        fetchItems();
    }, [page, sourceWordFilter, targetWordFilter, sortBy, sortOrder]);

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

    const confirmAction = (action, id = null) => {
        const ids = id ? [id] : selectedIds;
        if (ids.length === 0) return;

        setModalConfig({
            isOpen: true,
            title: action === 'approve' ? 'Approve Items' : 'Reject Items',
            message: `Are you sure you want to ${action} ${ids.length} item(s)?`,
            isDestructive: action === 'reject',
            onConfirm: () => {
                handleAction(action, id);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleAction = async (action, id = null) => {
        // Prepare IDs
        const ids = id ? [id] : selectedIds;
        if (ids.length === 0) return;

        console.log(`Proceeding with ${action} for ids:`, ids);

        try {
            let url, method, body;

            if (id) {
                // Single item action
                url = `${API_BASE_URL}/api/admin/${action}-replace-word/${id}`;
                method = 'POST';
                body = JSON.stringify({ reviewed_by: 'admin' });
            } else {
                // Batch action
                url = `${API_BASE_URL}/api/admin/batch-${action}-replace-words`;
                method = 'POST';
                body = JSON.stringify({ ids, reviewed_by: 'admin' });
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body
            });

            const result = await res.json();

            if (result.success) {
                fetchItems(); // Refresh list
            } else {
                alert(`Failed: ${result.message || 'Unknown error'}`);
                if (result.validation) {
                    alert(`Validation errors: ${JSON.stringify(result.validation)}`);
                }
                if (result.errors) {
                    alert(`Some items failed: \n${result.errors.map(e => `ID ${e.id}: ${e.error}`).join('\n')}`);
                    fetchItems(); // Refresh to show what succeeded
                }
            }

        } catch (err) {
            alert(`Error processing request: ${err.message}`);
        }
    };

    // Validate individual item
    const handleValidate = async (item) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/validate-replace-word`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_word: item.source_word,
                    target_word: item.target_word,
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
                <AddReplaceWordForm
                    onSuccess={() => {
                        setShowAddForm(false);
                        fetchItems();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            {/* Search Filters */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1">Search Source Word:</label>
                        <input
                            type="text"
                            value={sourceWordFilter}
                            onChange={(e) => setSourceWordFilter(e.target.value)}
                            placeholder="輸入原始詞彙搜尋..."
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Search Target Word:</label>
                        <input
                            type="text"
                            value={targetWordFilter}
                            onChange={(e) => setTargetWordFilter(e.target.value)}
                            placeholder="輸入替換詞彙搜尋..."
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                {(sourceWordFilter || targetWordFilter) && (
                    <div className="mt-2 flex justify-end">
                        <button
                            onClick={() => {
                                setSourceWordFilter('');
                                setTargetWordFilter('');
                            }}
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
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('source_word'); setSortOrder(sortBy === 'source_word' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Source Word {sortBy === 'source_word' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100" onClick={() => { setSortBy('target_word'); setSortOrder(sortBy === 'target_word' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Target Word {sortBy === 'target_word' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
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
                                <td className="px-4 py-2 border-b">{item.source_word}</td>
                                <td className="px-4 py-2 border-b">{item.target_word}</td>
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
                                    No pending items found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
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

            <div className="mt-8 text-sm text-gray-500">
                <h3 className="font-semibold mb-2">Instructions:</h3>
                <ul className="list-disc pl-5 space-y-1">
                    <li>Use checkboxes to select multiple items for batch approval or rejection.</li>
                    <li>Click <b>Check</b> to validate if the word conflicts with existing rules before approving.</li>
                    <li>Approval automatically moves the word to the active dictionary.</li>
                </ul>
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

export default ReplaceWordsReview;
