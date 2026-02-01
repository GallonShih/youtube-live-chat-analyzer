import React, { useState } from 'react';
import ValidationResultModal from './ValidationResultModal';
import { useToast } from '../../components/common/Toast';
import API_BASE_URL from '../../api/client';

const AddSpecialWordForm = ({ onSuccess, onCancel }) => {
    const toast = useToast();
    const [word, setWord] = useState('');
    const [isValidated, setIsValidated] = useState(false);
    const [validationResult, setValidationResult] = useState({
        isOpen: false,
        isValid: false,
        conflicts: []
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleValidate = async () => {
        if (!word.trim()) {
            setValidationResult({
                isOpen: true,
                isValid: false,
                conflicts: [{ type: 'error', message: 'Word 為必填欄位' }]
            });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/admin/validate-special-word`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: word.trim(),
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
            const res = await fetch(`${API_BASE_URL}/api/admin/add-special-word`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    word: word.trim()
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
        <div className="bg-white border border-gray-300 rounded-lg p-6 mb-4" role="region" aria-labelledby="add-special-word-title">
            <h3 id="add-special-word-title" className="text-lg font-bold mb-4">新增特殊詞彙</h3>
            <form onSubmit={handleSubmit} aria-label="新增特殊詞彙表單">
                <div className="mb-4">
                    <label htmlFor="special-word-input" className="block text-sm font-semibold mb-1">
                        Word <span className="text-red-500" aria-label="required">*</span>
                    </label>
                    <input
                        id="special-word-input"
                        type="text"
                        value={word}
                        onChange={(e) => { setWord(e.target.value); handleInputChange(); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="輸入詞彙"
                        required
                        aria-required="true"
                    />
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

export default AddSpecialWordForm;
