import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Toast Context
const ToastContext = createContext(null);

// Toast types configuration
const TOAST_CONFIG = {
    success: {
        icon: CheckCircleIcon,
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        iconColor: 'text-green-500',
        textColor: 'text-green-800',
    },
    error: {
        icon: ExclamationCircleIcon,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        iconColor: 'text-red-500',
        textColor: 'text-red-800',
    },
    warning: {
        icon: ExclamationTriangleIcon,
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        iconColor: 'text-amber-500',
        textColor: 'text-amber-800',
    },
    info: {
        icon: InformationCircleIcon,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        iconColor: 'text-blue-500',
        textColor: 'text-blue-800',
    },
};

// Individual Toast Component
const ToastItem = ({ toast, onDismiss }) => {
    const config = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;
    const Icon = config.icon;

    return (
        <div
            className={`
                flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md
                ${config.bgColor} ${config.borderColor}
                animate-slide-in
                max-w-sm w-full
            `}
            style={{ background: `rgba(255, 255, 255, 0.9)` }}
            role="alert"
        >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
            <div className={`flex-1 text-sm ${config.textColor}`}>
                {toast.title && <p className="font-semibold">{toast.title}</p>}
                <p className={toast.title ? 'mt-1' : ''}>{toast.message}</p>
            </div>
            <button
                onClick={() => onDismiss(toast.id)}
                className={`flex-shrink-0 ${config.iconColor} hover:opacity-70 cursor-pointer`}
            >
                <XMarkIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

// Toast Container Component
const ToastContainer = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed top-4 right-4 z-[9999] flex flex-col gap-2"
            aria-live="polite"
            aria-atomic="false"
            aria-relevant="additions removals"
        >
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

// Toast Provider
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', options = {}) => {
        const id = Date.now() + Math.random();
        const duration = options.duration ?? 4000;

        const newToast = {
            id,
            message,
            type,
            title: options.title,
        };

        setToasts(prev => [...prev, newToast]);

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }

        return id;
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toast = {
        success: (message, options) => addToast(message, 'success', options),
        error: (message, options) => addToast(message, 'error', options),
        warning: (message, options) => addToast(message, 'warning', options),
        info: (message, options) => addToast(message, 'info', options),
        dismiss: dismissToast,
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    );
};

// Hook to use toast
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export default ToastProvider;
