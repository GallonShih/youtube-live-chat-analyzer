import React, { useState } from 'react';
import ValidationResultModal from './ValidationResultModal';

const API_BASE_URL = 'http://localhost:8000';

const AddReplaceWordForm = ({ onSuccess, onCancel }) => {
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
                headers: { 'Content-Type': 'application/json' },
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
            alert('請先驗證詞彙是否符合標準');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/add-replace-word`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_word: sourceWord.trim(),
                    target_word: targetWord.trim()
                })
            });
            const result = await res.json();

            if (result.success) {
                alert('詞彙新增成功！');
                onSuccess();
            } else {
                alert(`新增失敗: ${result.message}`);
            }
        } catch (err) {
            alert(`新增失敗: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInputChange = () => {
        setIsValidated(false); // Reset validation when inputs change
    };

    return (
        <div className="bg-white border border-gray-300 rounded-lg p-6 mb-4">
            <h3 className="text-lg font-bold mb-4">新增替換詞彙</h3>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-semibold mb-1">
                            Source Word <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={sourceWord}
                            onChange={(e) => { setSourceWord(e.target.value); handleInputChange(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="輸入原始詞彙"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1">
                            Target Word <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={targetWord}
                            onChange={(e) => { setTargetWord(e.target.value); handleInputChange(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="輸入替換詞彙"
                            required
                        />
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button
                        type="button"
                        onClick={handleValidate}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded focus:outline-none"
                    >
                        檢查
                    </button>
                    <button
                        type="submit"
                        disabled={!isValidated || isSubmitting}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? '新增中...' : '新增'}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded focus:outline-none"
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
