import React, { useState, useEffect } from 'react';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import ConfirmModal from './ConfirmModal';
import ValidationResultModal from './ValidationResultModal';
import AddReplaceWordForm from './AddReplaceWordForm';
import WordDetailModal from './WordDetailModal';
import { useToast } from '../../components/common/Toast';
import API_BASE_URL, { authFetch } from '../../api/client';

const ReplaceWordsReview = () => {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [sourceWordFilter, setSourceWordFilter] = useState('');
    const [targetWordFilter, setTargetWordFilter] = useState('');
    // Local state for inputs
    const [localSourceWordFilter, setLocalSourceWordFilter] = useState('');
    const [localTargetWordFilter, setLocalTargetWordFilter] = useState('');

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
    const [wordDetailModal, setWordDetailModal] = useState({
        isOpen: false,
        word: '',
        wordType: 'replace',
        sourceWord: '',
        targetWord: ''
    });
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

            const res = await authFetch(`${API_BASE_URL}/api/admin/pending-replace-words?${params}`);
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

    const handleKeyDown = (e, type) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            if (type === 'source') setSourceWordFilter(localSourceWordFilter);
            if (type === 'target') setTargetWordFilter(localTargetWordFilter);
        }
    };

    const clearFilters = () => {
        setSourceWordFilter('');
        setLocalSourceWordFilter('');
        setTargetWordFilter('');
        setLocalTargetWordFilter('');
    };

    const confirmAction = (action, id = null) => {
        const ids = id ? [id] : selectedIds;
        if (action !== 'clear' && ids.length === 0) return;

        let title, message, isDestructive;

        if (action === 'clear') {
            title = 'Clear All Pending';
            message = 'Are you sure you want to REJECT ALL pending replace words? This action cannot be undone.';
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
                handleAction(action, id);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleAction = async (action, id = null) => {
        // Prepare IDs
        const ids = id ? [id] : selectedIds;
        if (action !== 'clear' && ids.length === 0) return;

        console.log(`Proceeding with ${action} for ids:`, ids);

        setIsProcessing(true);
        try {
            let url, method, body;

            if (action === 'clear') {
                // Clear all action
                url = `${API_BASE_URL}/api/admin/clear-pending-replace-words`;
                method = 'POST';
                body = JSON.stringify({ reviewed_by: 'admin' });
            } else if (id) {
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

            const res = await authFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body
            });

            const result = await res.json();

            if (result.success) {
                fetchItems(); // Refresh list
            } else {
                toast.error(`Failed: ${result.message || 'Unknown error'}`);
                if (result.validation) {
                    toast.error(`Validation errors: ${JSON.stringify(result.validation)}`);
                }
                if (result.errors) {
                    toast.error(`Some items failed: ${result.errors.length} errors`);
                    fetchItems(); // Refresh to show what succeeded
                }
            }

        } catch (err) {
            toast.error(`Error processing request: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // Validate individual item
    const handleValidate = async (item) => {
        try {
            const res = await authFetch(`${API_BASE_URL}/api/admin/validate-replace-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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


    if (loading && items.length === 0) {
        return (
            <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                <p className="mt-4 text-gray-500">載入中...</p>
            </div>
        );
    }
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
                            value={localSourceWordFilter}
                            onChange={(e) => setLocalSourceWordFilter(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 'source')}
                            onBlur={() => setSourceWordFilter(localSourceWordFilter)}
                            placeholder="輸入原始詞彙搜尋 (按 Enter)"
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Search Target Word:</label>
                        <input
                            type="text"
                            value={localTargetWordFilter}
                            onChange={(e) => setLocalTargetWordFilter(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, 'target')}
                            onBlur={() => setTargetWordFilter(localTargetWordFilter)}
                            placeholder="輸入替換詞彙搜尋 (按 Enter)"
                            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                {(sourceWordFilter || targetWordFilter || localSourceWordFilter || localTargetWordFilter) && (
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

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div className="flex flex-wrap gap-2">
                    <button
                        className="bg-purple-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-sm rounded hover:bg-purple-700 cursor-pointer"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? '關閉' : <><PlusIcon className="w-4 h-4 inline mr-1" />新增</>}
                    </button>
                    <button
                        className="bg-green-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        disabled={selectedIds.length === 0 || isProcessing}
                        onClick={() => confirmAction('approve')}
                    >
                        {isProcessing ? '...' : <><span className="hidden sm:inline">Approve </span>({selectedIds.length})</>}
                    </button>
                    <button
                        className="bg-red-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        disabled={selectedIds.length === 0 || isProcessing}
                        onClick={() => confirmAction('reject')}
                    >
                        {isProcessing ? '...' : <><span className="hidden sm:inline">Reject </span>({selectedIds.length})</>}
                    </button>
                    <button
                        className="bg-red-800 text-white px-3 py-1.5 sm:px-4 sm:py-2 text-sm rounded hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        onClick={() => confirmAction('clear')}
                        disabled={isProcessing}
                    >
                        <TrashIcon className="w-4 h-4 inline" />
                        <span className="hidden sm:inline ml-1">Clear All</span>
                    </button>
                </div>
                <div className="text-sm text-gray-600">
                    Total: {total}
                </div>
            </div>

            <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="min-w-full bg-white border border-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-2 sm:px-4 py-2 border-b w-8 sm:w-10">
                                <input
                                    type="checkbox"
                                    checked={items.length > 0 && selectedIds.length === items.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => { setSortBy('source_word'); setSortOrder(sortBy === 'source_word' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                <span className="hidden sm:inline">Source </span>Word {sortBy === 'source_word' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => { setSortBy('target_word'); setSortOrder(sortBy === 'target_word' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                <span className="hidden sm:inline">Target </span>Word {sortBy === 'target_word' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100 whitespace-nowrap" onClick={() => { setSortBy('confidence'); setSortOrder(sortBy === 'confidence' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                <span className="hidden sm:inline">Confidence</span><span className="sm:hidden">Conf</span> {sortBy === 'confidence' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100 whitespace-nowrap hidden md:table-cell" onClick={() => { setSortBy('occurrence'); setSortOrder(sortBy === 'occurrence' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Occur {sortBy === 'occurrence' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-left cursor-pointer hover:bg-gray-100 whitespace-nowrap hidden lg:table-cell" onClick={() => { setSortBy('discovered_at'); setSortOrder(sortBy === 'discovered_at' && sortOrder === 'asc' ? 'desc' : 'asc'); }}>
                                Discovered {sortBy === 'discovered_at' && (sortOrder === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-2 sm:px-4 py-2 border-b text-center">Act</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(item => (
                            <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-2 sm:px-4 py-2 border-b text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(item.id)}
                                        onChange={() => handleSelect(item.id)}
                                    />
                                </td>
                                <td className="px-2 sm:px-4 py-2 border-b">
                                    <button
                                        onClick={() => setWordDetailModal({
                                            isOpen: true,
                                            word: item.source_word,
                                            wordType: 'replace',
                                            sourceWord: item.source_word,
                                            targetWord: item.target_word
                                        })}
                                        className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 text-xs sm:text-sm"
                                    >
                                        {item.source_word}
                                    </button>
                                </td>
                                <td className="px-2 sm:px-4 py-2 border-b">
                                    <button
                                        onClick={() => setWordDetailModal({
                                            isOpen: true,
                                            word: item.target_word,
                                            wordType: 'replace',
                                            sourceWord: item.source_word,
                                            targetWord: item.target_word
                                        })}
                                        className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 text-xs sm:text-sm"
                                    >
                                        {item.target_word}
                                    </button>
                                </td>
                                <td className="px-2 sm:px-4 py-2 border-b">
                                    <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs text-white ${item.confidence_score > 0.8 ? 'bg-green-500' :
                                        item.confidence_score > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                                        }`}>
                                        {(item.confidence_score * 100).toFixed(0)}%
                                    </span>
                                </td>
                                <td className="px-2 sm:px-4 py-2 border-b hidden md:table-cell">{item.occurrence_count}</td>
                                <td className="px-2 sm:px-4 py-2 border-b text-xs text-gray-500 hidden lg:table-cell">
                                    {new Date(item.discovered_at).toLocaleDateString()}
                                </td>
                                <td className="px-2 sm:px-4 py-2 border-b text-center">
                                    <button
                                        onClick={() => handleValidate(item)}
                                        className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm underline cursor-pointer"
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
            <div className="mt-4 flex justify-between items-center gap-2">
                <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed"
                >
                    <span className="hidden sm:inline">Previous</span>
                    <span className="sm:hidden">Prev</span>
                </button>
                <span className="text-xs sm:text-sm text-gray-600">
                    {page + 1} / {Math.ceil(total / limit) || 1}
                </span>
                <button
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm border rounded disabled:opacity-50 hover:bg-gray-100 cursor-pointer disabled:cursor-not-allowed"
                >
                    Next
                </button>
            </div>

            <div className="mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500">
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

            <WordDetailModal
                isOpen={wordDetailModal.isOpen}
                onClose={() => setWordDetailModal(prev => ({ ...prev, isOpen: false }))}
                word={wordDetailModal.word}
                wordType={wordDetailModal.wordType}
                sourceWord={wordDetailModal.sourceWord}
                targetWord={wordDetailModal.targetWord}
            />
        </div>
    );
};

export default ReplaceWordsReview;
