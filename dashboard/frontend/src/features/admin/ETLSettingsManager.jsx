import React, { useState, useEffect, useCallback } from 'react';
import {
    Cog6ToothIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { fetchETLSettings, updateETLSetting } from '../../api/etl';

const CATEGORY_LABELS = {
    api: 'API',
    etl: 'ETL Processing',
    import: 'Dictionary Import',
    ai: 'AI Discovery',
    monitor: 'Collector Monitor',
};

const CATEGORY_ORDER = ['etl', 'ai', 'import', 'api', 'monitor'];

// Internal settings hidden from UI
const HIDDEN_KEYS = new Set(['MONITOR_ALERT_STATE']);

const ETLSettingsManager = () => {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});
    const [editValues, setEditValues] = useState({});
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchETLSettings();
            setSettings(data.settings || []);

            // Initialize edit values
            const values = {};
            (data.settings || []).forEach(s => {
                values[s.key] = s.value;
            });
            setEditValues(values);
            setError(null);
        } catch (err) {
            console.error('Error loading settings:', err);
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleChange = (key, value) => {
        setEditValues(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async (key) => {
        try {
            setSaving(prev => ({ ...prev, [key]: true }));
            await updateETLSetting(key, editValues[key]);
            setSuccessMessage(`Setting "${key}" saved`);
            setTimeout(() => setSuccessMessage(null), 3000);
            await loadSettings();
        } catch (err) {
            console.error('Error saving setting:', err);
            setError(`Failed to save ${key}`);
        } finally {
            setSaving(prev => ({ ...prev, [key]: false }));
        }
    };

    const renderInput = (setting) => {
        const { key, value_type, is_sensitive } = setting;
        const currentValue = editValues[key] ?? '';
        const hasChanged = currentValue !== setting.value;

        if (is_sensitive) {
            return (
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        value={currentValue}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder="******"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {hasChanged && (
                        <button
                            onClick={() => handleSave(key)}
                            disabled={saving[key]}
                            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                        >
                            {saving[key] ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Save'}
                        </button>
                    )}
                </div>
            );
        }

        switch (value_type) {
            case 'boolean':
                return (
                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={currentValue === 'true' || currentValue === true}
                                onChange={(e) => {
                                    const newValue = e.target.checked ? 'true' : 'false';
                                    handleChange(key, newValue);
                                    // Auto-save for boolean
                                    setTimeout(() => {
                                        updateETLSetting(key, newValue).then(() => {
                                            setSuccessMessage(`Setting "${key}" saved`);
                                            setTimeout(() => setSuccessMessage(null), 2000);
                                        });
                                    }, 100);
                                }}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                        <span className="text-sm text-gray-600">
                            {currentValue === 'true' || currentValue === true ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                );

            case 'integer':
            case 'float':
                return (
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            step={value_type === 'float' ? '0.1' : '1'}
                            value={currentValue}
                            onChange={(e) => handleChange(key, e.target.value)}
                            className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {hasChanged && (
                            <button
                                onClick={() => handleSave(key)}
                                disabled={saving[key]}
                                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                            >
                                {saving[key] ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Save'}
                            </button>
                        )}
                    </div>
                );

            case 'text':
                return (
                    <div className="space-y-2">
                        <textarea
                            value={currentValue}
                            onChange={(e) => handleChange(key, e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Enter value..."
                        />
                        {hasChanged && (
                            <button
                                onClick={() => handleSave(key)}
                                disabled={saving[key]}
                                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                            >
                                {saving[key] ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Save'}
                            </button>
                        )}
                    </div>
                );

            default: // string, datetime
                return (
                    <div className="flex items-center gap-2">
                        <input
                            type={value_type === 'datetime' ? 'datetime-local' : 'text'}
                            value={currentValue}
                            onChange={(e) => handleChange(key, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={value_type === 'datetime' ? 'YYYY-MM-DDTHH:mm:ss' : 'Enter value...'}
                        />
                        {hasChanged && (
                            <button
                                onClick={() => handleSave(key)}
                                disabled={saving[key]}
                                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                            >
                                {saving[key] ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Save'}
                            </button>
                        )}
                    </div>
                );
        }
    };

    // Group settings by category (exclude internal keys)
    const groupedSettings = CATEGORY_ORDER.reduce((acc, category) => {
        acc[category] = settings.filter(s => s.category === category && !HIDDEN_KEYS.has(s.key));
        return acc;
    }, {});

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Alerts */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto">&times;</button>
                </div>
            )}
            {successMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    {successMessage}
                </div>
            )}

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
                <strong>Note:</strong> Changes take effect immediately on the next ETL job execution.
                Sensitive settings like API keys should be configured in the <code className="bg-blue-100 px-1 rounded">.env</code> file.
            </div>

            {/* Settings by Category */}
            {CATEGORY_ORDER.map(category => {
                const categorySettings = groupedSettings[category];
                if (!categorySettings || categorySettings.length === 0) return null;

                return (
                    <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <Cog6ToothIcon className="w-5 h-5" />
                                {CATEGORY_LABELS[category] || category}
                            </h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {categorySettings.map(setting => (
                                <div key={setting.key} className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                        <div className="sm:w-1/3">
                                            <label className="block font-medium text-gray-900">
                                                {setting.key}
                                            </label>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {setting.description}
                                            </p>
                                            {setting.is_sensitive && (
                                                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                                                    Sensitive
                                                </span>
                                            )}
                                        </div>
                                        <div className="sm:w-2/3">
                                            {renderInput(setting)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* Refresh Button */}
            <div className="flex justify-end">
                <button
                    onClick={loadSettings}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowPathIcon className="w-4 h-4" />
                    Refresh
                </button>
            </div>
        </div>
    );
};

export default ETLSettingsManager;
