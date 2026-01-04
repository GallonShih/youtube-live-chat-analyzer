import React from 'react';

const ValidationResultModal = ({ isOpen, isValid, conflicts, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden transform transition-all">
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-center mb-4">
                        {isValid ? (
                            <>
                                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-4">
                                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-green-700">驗證通過 ✓</h3>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mr-4">
                                    <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-red-700">驗證失敗 ✗</h3>
                            </>
                        )}
                    </div>

                    {/* Content */}
                    <div className="mb-6">
                        {isValid ? (
                            <p className="text-gray-700">未發現衝突，此詞彙可以安全批准。</p>
                        ) : (
                            <div>
                                <p className="text-gray-700 mb-3 font-semibold">發現以下衝突：</p>
                                <div className="bg-red-50 border border-red-200 rounded p-4 max-h-96 overflow-y-auto">
                                    {conflicts && conflicts.length > 0 ? (
                                        <ul className="space-y-2">
                                            {conflicts.map((conflict, index) => (
                                                <li key={index} className="text-sm">
                                                    <span className="font-semibold text-red-700">
                                                        {conflict.type}:
                                                    </span>
                                                    <span className="text-gray-800 ml-2">
                                                        {conflict.message}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-gray-600">未提供詳細資訊</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded focus:outline-none transition-colors"
                        >
                            確定
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ValidationResultModal;
