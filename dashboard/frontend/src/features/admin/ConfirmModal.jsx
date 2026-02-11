import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const ConfirmModal = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = false,
    usePortal = false
}) => {
    const cancelButtonRef = useRef(null);
    const modalRef = useRef(null);

    // Focus management and keyboard handling
    useEffect(() => {
        if (isOpen) {
            // Focus the cancel button when modal opens
            cancelButtonRef.current?.focus();

            // Handle Escape key
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    onCancel();
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onCancel]);

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    const modal = (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
            onClick={(e) => {
                // Close on backdrop click
                if (e.target === e.currentTarget) onCancel();
            }}
        >
            <div
                ref={modalRef}
                className="glass-modal rounded-xl sm:rounded-2xl max-w-md w-full overflow-hidden transform transition-all"
            >
                <div className="p-4 sm:p-6">
                    <h3
                        id="modal-title"
                        className="text-base sm:text-lg font-bold text-gray-900 mb-2"
                    >
                        {title}
                    </h3>
                    <p
                        id="modal-description"
                        className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6"
                    >
                        {message}
                    </p>
                    <div className="flex justify-end space-x-2 sm:space-x-3">
                        <button
                            ref={cancelButtonRef}
                            onClick={onCancel}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`px-3 sm:px-4 py-1.5 sm:py-2 text-sm text-white rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                isDestructive
                                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                            }`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return usePortal ? createPortal(modal, document.body) : modal;
};

export default ConfirmModal;
