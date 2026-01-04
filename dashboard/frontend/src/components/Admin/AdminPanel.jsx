import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ReplaceWordsReview from './ReplaceWordsReview';
import SpecialWordsReview from './SpecialWordsReview';

const AdminPanel = () => {
    const [activeTab, setActiveTab] = useState('replace'); // 'replace' or 'special'

    return (
        <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="text-3xl font-bold text-gray-800">Hermes Admin Panel</h1>

                    <div className="flex gap-4">
                        <Link to="/" className="text-gray-600 hover:text-blue-600">Dashboard</Link>
                        <Link to="/admin" className="text-blue-600 font-bold underline">Admin Panel</Link>
                    </div>
                </header>

                <div className="bg-white rounded-lg shadow-md overflow-hidden">
                    <div className="flex border-b border-gray-200">
                        <button
                            className={`px-6 py-4 font-medium text-sm focus:outline-none ${activeTab === 'replace'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('replace')}
                        >
                            Pending Replace Words
                        </button>
                        <button
                            className={`px-6 py-4 font-medium text-sm focus:outline-none ${activeTab === 'special'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('special')}
                        >
                            Pending Special Words
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'replace' ? <ReplaceWordsReview /> : <SpecialWordsReview />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
