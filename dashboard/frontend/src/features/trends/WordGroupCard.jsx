import React, { useState, useEffect, useRef } from 'react';
import {
    EyeIcon,
    EyeSlashIcon,
    PencilIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';

/**
 * Card component for managing a single word group
 * Supports: edit name, add/remove words, change color, delete group
 */
const WordGroupCard = ({
    group,
    isNew = false,
    onSave,
    onDelete,
    onCancel,
    isVisible = true,
    onToggleVisibility,
    isAdmin = false
}) => {
    const [name, setName] = useState(group?.name || '');
    const [words, setWords] = useState(group?.words || []);
    const [color, setColor] = useState(group?.color || '#5470C6');
    const [newWord, setNewWord] = useState('');
    const [isEditing, setIsEditing] = useState(isNew);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const newWordInputRef = useRef(null);

    useEffect(() => {
        if (group) {
            setName(group.name || '');
            setWords(group.words || []);
            setColor(group.color || '#5470C6');
        }
    }, [group]);

    const handleAddWord = () => {
        const trimmed = newWord.trim();
        if (trimmed && !words.includes(trimmed)) {
            setWords([...words, trimmed]);
            setNewWord('');
            newWordInputRef.current?.focus();
        }
    };

    const handleRemoveWord = (wordToRemove) => {
        setWords(words.filter(w => w !== wordToRemove));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleAddWord();
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError('請輸入詞彙組名稱');
            return;
        }
        if (words.length === 0) {
            setError('請至少新增一個詞彙');
            return;
        }

        setIsSaving(true);
        setError('');
        try {
            await onSave({
                id: group?.id,
                name: name.trim(),
                words,
                color
            });
            setIsEditing(false);
        } catch (err) {
            setError(err.message || '儲存失敗');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        if (isNew) {
            onCancel?.();
        } else {
            setName(group.name);
            setWords(group.words);
            setColor(group.color);
            setIsEditing(false);
            setError('');
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`確定要刪除「${group.name}」嗎？`)) return;
        try {
            await onDelete(group.id);
        } catch (err) {
            setError(err.message || '刪除失敗');
        }
    };

    // Preset colors for quick selection
    const presetColors = [
        '#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE',
        '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC', '#48c9b0'
    ];

    return (
        <div className={`bg-white rounded-lg shadow-md p-4 mb-3 border-l-4 transition-all ${isVisible ? 'opacity-100' : 'opacity-50'
            }`} style={{ borderLeftColor: color }}>
            {/* Header Row */}
            <div className="flex items-center justify-between mb-3">
                {isEditing ? (
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="詞彙組名稱（例：Vtuber 名字）"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-medium"
                        autoFocus={isNew}
                    />
                ) : (
                    <h3 className="text-lg font-semibold text-gray-800">{name}</h3>
                )}

                <div className="flex items-center gap-2 ml-3">
                    {!isEditing && (
                        <>
                            <button
                                onClick={() => onToggleVisibility?.(group.id)}
                                className={`p-2 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isVisible
                                        ? 'text-blue-600 hover:bg-blue-50'
                                        : 'text-gray-400 hover:bg-gray-100'
                                    }`}
                                title={isVisible ? '隱藏圖表' : '顯示圖表'}
                                aria-label={isVisible ? '隱藏圖表' : '顯示圖表'}
                            >
                                {isVisible ? <EyeIcon className="w-5 h-5" /> : <EyeSlashIcon className="w-5 h-5" />}
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    title="編輯"
                                    aria-label="編輯詞彙組"
                                >
                                    <PencilIcon className="w-5 h-5" />
                                </button>
                            )}
                            {isAdmin && (
                                <button
                                    onClick={handleDelete}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                    title="刪除"
                                    aria-label="刪除詞彙組"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Words Tags */}
            <div className="flex flex-wrap gap-2 mb-3">
                {words.map((word, idx) => (
                    <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                            backgroundColor: color + '20',
                            color: color
                        }}
                    >
                        {word}
                        {isEditing && (
                            <button
                                onClick={() => handleRemoveWord(word)}
                                className="ml-2 text-current opacity-60 hover:opacity-100"
                            >
                                ×
                            </button>
                        )}
                    </span>
                ))}
                {isEditing && (
                    <div className="inline-flex items-center">
                        <input
                            ref={newWordInputRef}
                            type="text"
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="新增詞彙..."
                            className="px-3 py-1 border border-dashed border-gray-300 rounded-full text-sm focus:outline-none focus:border-blue-500 w-32"
                        />
                        <button
                            onClick={handleAddWord}
                            className="ml-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded-full text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="新增詞彙"
                        >
                            +
                        </button>
                    </div>
                )}
            </div>

            {/* Color Picker (only in edit mode) */}
            {isEditing && (
                <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm text-gray-600">顏色:</span>
                    <div className="flex gap-1">
                        {presetColors.map((c) => (
                            <button
                                key={c}
                                onClick={() => setColor(c)}
                                className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:scale-105'
                                    }`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <input
                        type="text"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        placeholder="#5470C6"
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                    />
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="text-red-500 text-sm mb-3 bg-red-50 px-3 py-2 rounded">
                    {error}
                </div>
            )}

            {/* Action Buttons (only in edit mode) */}
            {isEditing && (
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        {isSaving ? '儲存中...' : '儲存'}
                    </button>
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 text-gray-600 font-medium rounded-lg hover:bg-gray-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                    >
                        取消
                    </button>
                </div>
            )}
        </div>
    );
};

export default WordGroupCard;
