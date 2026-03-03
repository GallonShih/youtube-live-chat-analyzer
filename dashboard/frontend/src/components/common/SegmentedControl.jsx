import React from 'react';

/**
 * Reusable SegmentedControl component
 *
 * @param {Array} options - Array of { value, label, icon? (React element) }
 * @param {string} value - Currently selected value
 * @param {Function} onChange - Callback when selection changes
 * @param {string} [className] - Additional wrapper class names
 * @param {string} [size='md'] - Size variant: 'sm' | 'md'
 */
function SegmentedControl({ options, value, onChange, className = '', size = 'md' }) {
    const sizeClasses = size === 'sm'
        ? 'px-3 py-1.5 text-xs'
        : 'px-4 py-2 text-sm';

    return (
        <div className={`inline-flex rounded-lg overflow-hidden border border-gray-200 ${className}`}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    className={`${sizeClasses} font-medium cursor-pointer transition-colors flex items-center gap-1.5 ${
                        value === opt.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.icon && <span className="w-4 h-4">{opt.icon}</span>}
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export default SegmentedControl;
