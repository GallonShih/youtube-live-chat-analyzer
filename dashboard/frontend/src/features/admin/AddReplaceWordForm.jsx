import React, { useState } from 'react';
import ValidationResultModal from './ValidationResultModal';
import { useToast } from '../../components/common/Toast';
import API_BASE_URL, { authFetch } from '../../api/client';

const AddReplaceWordForm = ({ onSuccess, onCancel }) => {
    const toast = useToast();
    const [sourceWord, setSourceWord] = useState('');
    const [targetWord, setTargetWord] = useState('');
    const [isValidated, setIsValidated] = useState(false);
    const [validationResult, setValidationResult] = useState({
        isOpen: false,
        isValid: false,
        conflicts: [],
        warnings: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sourceWhitespaceError, setSourceWhitespaceError] = useState(false);
    const [targetWhitespaceError, setTargetWhitespaceError] = useState(false);

    const handleValidate = async () => {
        if (!sourceWord.trim() || !targetWord.trim()) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: 'Source Word 和 Target Word 為必填欄位' }],
                warnings: []
            });
            return;
        }

        if (sourceWhitespaceError || targetWhitespaceError || /^\s|\s$/.test(sourceWord) || /^\s|\s$/.test(targetWord)) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: '前後不可包含空白' }],
                warnings: []
            });
            return;
        }

        try {
            const res = await authFetch(`${API_BASE_URL}/api/admin/validate-replace-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source_word: sourceWord,
                    target_word: targetWord,
                    pending_id: null
                })
            });
            const result = await res.json();

            setValidationResult({
                isOpen: true,
                isValid: result.valid,
                conflicts: result.conflicts || [],
                warnings: result.warnings || []
            });

            setIsValidated(result.valid);
        } catch (err) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: '驗證請求失敗，請稍後再試' }],
                warnings: []
            });
            setIsValidated(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isValidated) {
            toast.warning('請先驗證詞彙是否符合標準');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await authFetch(`${API_BASE_URL}/api/admin/add-replace-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source_word: sourceWord.trim(),
                    target_word: targetWord.trim()
                })
            });
            const result = await res.json();

            if (result.success) {
                toast.success('詞彙新增成功！');
                onSuccess();
            } else {
                toast.error(`新增失敗: ${result.message}`);
            }
        } catch (err) {
            toast.error(`新增失敗: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInputChange = () => {
        setIsValidated(false); // Reset validation when inputs change
    };

    return (
        <div className="bg-white border border-gray-300 rounded-lg p-6 mb-4" role="region" aria-labelledby="add-replace-word-title">
            <h3 id="add-replace-word-title" className="text-lg font-bold mb-4">新增替換詞彙</h3>
            <form onSubmit={handleSubmit} aria-label="新增替換詞彙表單">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label htmlFor="source-word-input" className="block text-sm font-semibold mb-1">
                            Source Word <span className="text-red-500" aria-label="required">*</span>
                        </label>
                        <input
                            id="source-word-input"
                            type="text"
                            value={sourceWord}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSourceWord(val);
                                setSourceWhitespaceError(/^\s|\s$/.test(val));
                                handleInputChange();
                            }}
                            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${sourceWhitespaceError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                            placeholder="輸入原始詞彙"
                            required
                            aria-required="true"
                        />
                        {sourceWhitespaceError && (
                            <p className="mt-1 text-sm text-red-600">前後不可包含空白</p>
                        )}
                    </div>
                    <div>
                        <label htmlFor="target-word-input" className="block text-sm font-semibold mb-1">
                            Target Word <span className="text-red-500" aria-label="required">*</span>
                        </label>
                        <input
                            id="target-word-input"
                            type="text"
                            value={targetWord}
                            onChange={(e) => {
                                const val = e.target.value;
                                setTargetWord(val);
                                setTargetWhitespaceError(/^\s|\s$/.test(val));
                                handleInputChange();
                            }}
                            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${targetWhitespaceError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                            placeholder="輸入替換詞彙"
                            required
                            aria-required="true"
                        />
                        {targetWhitespaceError && (
                            <p className="mt-1 text-sm text-red-600">前後不可包含空白</p>
                        )}
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button
                        type="button"
                        onClick={handleValidate}
                        disabled={!sourceWord.trim() || !targetWord.trim() || sourceWhitespaceError || targetWhitespaceError}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        檢查
                    </button>
                    <button
                        type="submit"
                        disabled={!isValidated || isSubmitting}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-busy={isSubmitting}
                    >
                        {isSubmitting ? '新增中...' : '新增'}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    >
                        取消
                    </button>
                </div>
            </form>

            <ValidationResultModal
                isOpen={validationResult.isOpen}
                isValid={validationResult.isValid}
                conflicts={validationResult.conflicts}
                warnings={validationResult.warnings}
                onClose={() => setValidationResult(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default AddReplaceWordForm;
