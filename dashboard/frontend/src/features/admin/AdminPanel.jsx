import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ChartBarIcon,
    PlayIcon,
    ArrowTrendingUpIcon,
    Cog6ToothIcon,
    CurrencyDollarIcon,
    MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import ReplaceWordsReview from './ReplaceWordsReview';
import SpecialWordsReview from './SpecialWordsReview';
import CurrencyRateManager from './CurrencyRateManager';
import SettingsManager from './SettingsManager';
import TextMining from './TextMining';

const AdminPanel = () => {
    const [activeTab, setActiveTab] = useState('replace');

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <h1 className="flex items-center gap-2 text-3xl font-bold text-white drop-shadow-lg mb-4 md:mb-0">
                        <Cog6ToothIcon className="w-8 h-8" />
                        <span>Hermes Admin Panel</span>
                    </h1>

                    <div className="flex gap-3">
                        <Link
                            to="/"
                            className="flex items-center gap-2 px-4 py-2 glass-button text-gray-700 font-semibold rounded-xl cursor-pointer"
                        >
                            <ChartBarIcon className="w-5 h-5" />
                            <span>Dashboard</span>
                        </Link>
                        <Link
                            to="/playback"
                            className="flex items-center gap-2 px-4 py-2 glass-button text-gray-700 font-semibold rounded-xl cursor-pointer"
                        >
                            <PlayIcon className="w-5 h-5" />
                            <span>Playback</span>
                        </Link>
                        <Link
                            to="/trends"
                            className="flex items-center gap-2 px-4 py-2 glass-button text-gray-700 font-semibold rounded-xl cursor-pointer"
                        >
                            <ArrowTrendingUpIcon className="w-5 h-5" />
                            <span>Trends</span>
                        </Link>
                        <Link
                            to="/admin"
                            className="flex items-center gap-2 px-4 py-2 bg-white/90 text-indigo-700 font-semibold rounded-xl shadow-lg hover:bg-white hover:shadow-xl transition-all duration-200 cursor-pointer backdrop-blur-sm border border-white/50"
                        >
                            <Cog6ToothIcon className="w-5 h-5" />
                            <span>Admin Panel</span>
                        </Link>
                    </div>
                </header>

                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="flex border-b border-gray-200 overflow-x-auto">
                        <button
                            className={`px-6 py-4 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'replace'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('replace')}
                        >
                            Pending Replace Words
                        </button>
                        <button
                            className={`px-6 py-4 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'special'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('special')}
                        >
                            Pending Special Words
                        </button>
                        <button
                            className={`flex items-center gap-2 px-6 py-4 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'currency'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('currency')}
                        >
                            <CurrencyDollarIcon className="w-4 h-4" />
                            <span>Currency Rates</span>
                        </button>
                        <button
                            className={`flex items-center gap-2 px-6 py-4 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'settings'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Cog6ToothIcon className="w-4 h-4" />
                            <span>Settings</span>
                        </button>
                        <button
                            className={`flex items-center gap-2 px-6 py-4 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'textmining'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('textmining')}
                        >
                            <MagnifyingGlassIcon className="w-4 h-4" />
                            <span>Text Mining</span>
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === 'replace' && <ReplaceWordsReview />}
                        {activeTab === 'special' && <SpecialWordsReview />}
                        {activeTab === 'currency' && <CurrencyRateManager />}
                        {activeTab === 'settings' && <SettingsManager />}
                        {activeTab === 'textmining' && <TextMining />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
