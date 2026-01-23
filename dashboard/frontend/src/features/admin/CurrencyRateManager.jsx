import { useState, useEffect } from 'react';
import API_BASE_URL from '../../api/client';

const CurrencyRateManager = () => {
    const [rates, setRates] = useState([]);
    const [unknownCurrencies, setUnknownCurrencies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Form state
    const [currency, setCurrency] = useState('');
    const [rateToTwd, setRateToTwd] = useState('');
    const [notes, setNotes] = useState('');
    const [editingCurrency, setEditingCurrency] = useState(null);

    useEffect(() => {
        fetchRates();
        fetchUnknownCurrencies();
    }, []);

    const fetchRates = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/currency-rates`);
            const data = await response.json();
            setRates(data.rates || []);
            setError(null);
        } catch (err) {
            console.error('Error fetching rates:', err);
            setError('Failed to load currency rates');
        } finally {
            setLoading(false);
        }
    };

    const fetchUnknownCurrencies = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/currency-rates/unknown`);
            const data = await response.json();
            setUnknownCurrencies(data.unknown_currencies || []);
        } catch (err) {
            console.error('Error fetching unknown currencies:', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!currency || !rateToTwd) {
            alert('Please fill in currency code and rate');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/currency-rates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currency: currency.toUpperCase(),
                    rate_to_twd: parseFloat(rateToTwd),
                    notes: notes
                })
            });

            const data = await response.json();

            if (data.success) {
                alert(data.message);
                // Reset form
                setCurrency('');
                setRateToTwd('');
                setNotes('');
                setEditingCurrency(null);
                // Refresh data
                fetchRates();
                fetchUnknownCurrencies();
            } else {
                alert('Failed to save rate');
            }
        } catch (err) {
            console.error('Error saving rate:', err);
            alert('Error saving rate');
        }
    };

    const handleEdit = (rate) => {
        setCurrency(rate.currency);
        setRateToTwd(rate.rate_to_twd.toString());
        setNotes(rate.notes || '');
        setEditingCurrency(rate.currency);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleQuickAdd = (curr) => {
        setCurrency(curr.currency);
        setRateToTwd('');
        setNotes('');
        setEditingCurrency(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return <div className="p-6 text-center">Loading...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Currency Rate Management 💱</h2>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            {/* Add/Edit Form */}
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">
                    {editingCurrency ? `Edit Rate for ${editingCurrency}` : 'Add New Currency Rate'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Currency Code *
                            </label>
                            <input
                                type="text"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                                placeholder="e.g., USD, JPY, HKD"
                                maxLength="10"
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={editingCurrency !== null}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Rate to TWD *
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={rateToTwd}
                                onChange={(e) => setRateToTwd(e.target.value)}
                                placeholder="e.g., 31.5"
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Notes
                            </label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Optional notes"
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                        >
                            {editingCurrency ? 'Update' : 'Add'} Rate
                        </button>
                        {editingCurrency && (
                            <button
                                type="button"
                                onClick={() => {
                                    setCurrency('');
                                    setRateToTwd('');
                                    setNotes('');
                                    setEditingCurrency(null);
                                }}
                                className="px-6 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* Unknown Currencies */}
            {unknownCurrencies.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-yellow-800 mb-4">
                        ⚠️ Unknown Currencies ({unknownCurrencies.length})
                    </h3>
                    <p className="text-sm text-yellow-700 mb-3">
                        These currencies appear in your messages but don't have exchange rates set yet.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {unknownCurrencies.map((curr) => (
                            <button
                                key={curr.currency}
                                onClick={() => handleQuickAdd(curr)}
                                className="bg-white border border-yellow-300 rounded px-3 py-2 text-sm hover:bg-yellow-100 transition text-left"
                            >
                                <div className="font-semibold">{curr.currency}</div>
                                <div className="text-xs text-gray-600">{curr.message_count} messages</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Existing Rates Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800">
                        Configured Rates ({rates.length})
                    </h3>
                </div>
                {rates.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                        No currency rates configured yet. Add one above!
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate to TWD</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated At</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {rates.map((rate) => (
                                    <tr key={rate.currency} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-semibold">{rate.currency}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">{rate.rate_to_twd.toFixed(4)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                            {formatDate(rate.updated_at)}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{rate.notes || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => handleEdit(rate)}
                                                className="text-blue-600 hover:text-blue-800 font-medium"
                                            >
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CurrencyRateManager;
