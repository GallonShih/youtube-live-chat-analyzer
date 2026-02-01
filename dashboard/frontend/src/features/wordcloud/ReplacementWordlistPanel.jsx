import React, { useState, useEffect, useCallback } from 'react';
import { ArrowsRightLeftIcon, ArrowRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useReplacementWordlists } from '../../hooks/useReplacementWordlists';
import { useToast } from '../../components/common/Toast';
import ConfirmModal from '../admin/ConfirmModal';

const ReplacementWordlistPanel = ({
    selectedId,
    onSelect,
    onUpdate,
    rules,
    onRulesChange,
    source,
    onSourceChange,
    target,
    onTargetChange
}) => {
    const toast = useToast();

    // Hooks
    const {
        savedWordlists,
        loading,
        saveWordlist,
        updateWordlist,
        removeWordlist
    } = useReplacementWordlists();

    // UI state
    const [isModified, setIsModified] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [createError, setCreateError] = useState('');
    const [updateSuccess, setUpdateSuccess] = useState(false);

    // Confirm Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
        isDestructive: false
    });

    // Reset modified state when list selection changes
    useEffect(() => {
        setIsModified(false);
    }, [selectedId]);

    // Handlers
    const handleAddRule = () => {
        if (!source.trim() || !target.trim()) return;

        // Remove existing rule for same source if any (to avoid duplicates)
        const filtered = rules.filter(r => r.source !== source.trim());
        const newRules = [...filtered, { source: source.trim(), target: target.trim() }];

        onRulesChange(newRules);
        onSourceChange('');
        onTargetChange('');
        setIsModified(true);
    };

    const confirmRemoveRule = (ruleSource) => {
        setModalConfig({
            isOpen: true,
            title: '移除取代規則',
            message: `確定要移除「${ruleSource}」的取代規則嗎？`,
            isDestructive: true,
            onConfirm: () => {
                const newRules = rules.filter(r => r.source !== ruleSource);
                onRulesChange(newRules);
                setIsModified(true);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const handleSaveChanges = async () => {
        if (!selectedId) return;
        try {
            await updateWordlist(selectedId, rules);
            setIsModified(false);
            setUpdateSuccess(true);
            setTimeout(() => setUpdateSuccess(false), 2000);
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error(err);
        }
    };

    const handleCreateNew = async () => {
        if (!newListName.trim()) {
            setCreateError('請輸入名稱');
            return;
        }
        try {
            const data = await saveWordlist(newListName.trim(), rules);
            setShowCreateModal(false);
            setNewListName('');
            setCreateError('');
            setIsModified(false);
            if (onSelect) onSelect(data.id);
        } catch (err) {
            setCreateError(err.message);
        }
    };

    const confirmDeleteList = () => {
        if (!selectedId) return;
        setModalConfig({
            isOpen: true,
            title: '刪除取代清單',
            message: '確定要刪除此取代清單？此操作無法復原。',
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await removeWordlist(selectedId);
                    if (onSelect) onSelect(null);
                    toast.success('取代清單已刪除');
                } catch (err) {
                    console.error(err);
                    toast.error(`刪除失敗: ${err.message}`);
                } finally {
                    setModalConfig(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const currentListName = savedWordlists.find(w => w.id === selectedId)?.name;

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mt-4">
            {/* Header / Selector */}
            <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700 flex items-center gap-1"><ArrowsRightLeftIcon className="w-4 h-4" /> 取代規則</span>
                    {currentListName && <span className="text-sm text-gray-600">({currentListName}{isModified ? '*' : ''})</span>}
                </div>

                <div className="flex gap-2">
                    <select
                        value={selectedId || ''}
                        onChange={(e) => onSelect(e.target.value ? parseInt(e.target.value) : null)}
                        className="border rounded px-2 py-1 text-sm max-w-[150px]"
                    >
                        <option value="">-- 無 --</option>
                        {savedWordlists.map(w => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                    </select>

                    {selectedId ? (
                        <>
                            <button
                                onClick={handleSaveChanges}
                                className={`${updateSuccess ? 'bg-gray-500' : 'bg-green-500'} text-white px-2 py-1 rounded text-xs hover:${updateSuccess ? 'bg-gray-600' : 'bg-green-600'} transition-colors duration-200`}
                                disabled={updateSuccess}
                            >
                                {updateSuccess ? '已更新!' : '更新'}
                            </button>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                            >
                                另存
                            </button>
                            <button
                                onClick={confirmDeleteList}
                                className="text-red-600 border border-red-200 px-2 py-1 rounded text-xs hover:bg-red-50 cursor-pointer"
                            >
                                刪除
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"
                            disabled={rules.length === 0}
                        >
                            儲存為新清單
                        </button>
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="space-y-3">
                {/* Input Row */}
                <div className="flex gap-2 items-center">
                    <label htmlFor="replacement-source" className="sr-only">原始詞</label>
                    <input
                        id="replacement-source"
                        type="text"
                        value={source}
                        onChange={(e) => onSourceChange(e.target.value)}
                        placeholder="原始詞 (如: 酥)"
                        className="border rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        aria-label="原始詞"
                    />
                    <ArrowRightIcon className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    <label htmlFor="replacement-target" className="sr-only">取代為</label>
                    <input
                        id="replacement-target"
                        type="text"
                        value={target}
                        onChange={(e) => onTargetChange(e.target.value)}
                        placeholder="取代為 (如: 方塊酥)"
                        className="border rounded px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddRule()}
                        aria-label="取代為"
                    />
                    <button
                        onClick={handleAddRule}
                        disabled={!source.trim() || !target.trim()}
                        className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        aria-label="新增取代規則"
                    >
                        +
                    </button>
                </div>

                {/* Rules List */}
                <div className="bg-gray-50 rounded p-2 max-h-[150px] overflow-y-auto border border-gray-100 flex flex-wrap gap-2" role="list" aria-label="取代規則清單">
                    {rules.length === 0 && <div className="text-gray-400 text-xs w-full text-center py-2">尚無取代規則</div>}
                    {rules.map((rule, idx) => (
                        <div key={`${rule.source}-${idx}`} className="bg-white border rounded px-2 py-1 text-sm flex items-center gap-2 shadow-sm" role="listitem">
                            <span className="text-gray-600">{rule.source}</span>
                            <ArrowRightIcon className="w-3 h-3 text-purple-400" aria-hidden="true" />
                            <span className="font-medium text-gray-800">{rule.target}</span>
                            <button
                                type="button"
                                onClick={() => confirmRemoveRule(rule.source)}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 ml-1 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                                aria-label={`移除 ${rule.source} 到 ${rule.target} 的規則`}
                            >
                                <XMarkIcon className="w-4 h-4" aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="create-list-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowCreateModal(false);
                    }}
                >
                    <div className="bg-white rounded-lg p-6 w-80 shadow-xl">
                        <h3 id="create-list-title" className="text-lg font-bold mb-4">建立取代清單</h3>
                        <label htmlFor="new-list-name" className="sr-only">清單名稱</label>
                        <input
                            id="new-list-name"
                            type="text"
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            placeholder="清單名稱"
                            className="w-full border p-2 mb-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            aria-required="true"
                            aria-describedby={createError ? "create-error" : undefined}
                        />
                        {createError && <div id="create-error" className="text-red-500 text-sm mb-2" role="alert">{createError}</div>}
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateNew}
                                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                            >
                                建立
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                isDestructive={modalConfig.isDestructive}
                confirmText="確定"
                cancelText="取消"
            />
        </div>
    );
};

export default ReplacementWordlistPanel;
