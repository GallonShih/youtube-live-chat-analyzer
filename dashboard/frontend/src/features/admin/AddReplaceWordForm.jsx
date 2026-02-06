import React, { useState } from 'react';
import ValidationResultModal from './ValidationResultModal';
import { useToast } from '../../components/common/Toast';
import API_BASE_URL from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const AddReplaceWordForm = ({ onSuccess, onCancel }) => {
    const toast = useToast();
    const { getAuthHeaders } = useAuth();
    const [sourceWord, setSourceWord] = useState('');
    const [targetWord, setTargetWord] = useState('');
    const [isValidated, setIsValidated] = useState(false);
    const [validationResult, setValidationResult] = useState({
        isOpen: false,
        isValid: false,
        conflicts: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleValidate = async () => {
        if (!sourceWord.trim() || !targetWord.trim()) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: 'Source Word 和 Target Word 為必填欄位' }]
            });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/validate-replace-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify({
                    source_word: sourceWord.trim(),
                    target_word: targetWord.trim(),
                    pending_id: null
                })
            });
            const result = await res.json();

            setValidationResult({
                isOpen: true,
                isValid: result.valid,
                conflicts: result.conflicts || []
            });

            setIsValidated(result.valid);
        } catch (err) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: '驗證請求失敗，請稍後再試' }]
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
            const res = await fetch(`${API_BASE_URL}/api/admin/add-replace-word`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
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
                            onChange={(e) => { setSourceWord(e.target.value); handleInputChange(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="輸入原始詞彙"
                            required
                            aria-required="true"
                        />
                    </div>
                    <div>
                        <label htmlFor="target-word-input" className="block text-sm font-semibold mb-1">
                            Target Word <span className="text-red-500" aria-label="required">*</span>
                        </label>
                        <input
                            id="target-word-input"
                            type="text"
                            value={targetWord}
                            onChange={(e) => { setTargetWord(e.target.value); handleInputChange(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="輸入替換詞彙"
                            required
                            aria-required="true"
                        />
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button
                        type="button"
                        onClick={handleValidate}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
                onClose={() => setValidationResult(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default AddReplaceWordForm;
