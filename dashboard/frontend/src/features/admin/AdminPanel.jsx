import React, { useState } from 'react';
import {
    Cog6ToothIcon,
    CurrencyDollarIcon,
    MagnifyingGlassIcon,
    ClockIcon,
    BookOpenIcon,
} from '@heroicons/react/24/outline';
import Navigation from '../../components/common/Navigation';
import ReplaceWordsReview from './ReplaceWordsReview';
import SpecialWordsReview from './SpecialWordsReview';
import CurrencyRateManager from './CurrencyRateManager';
import SettingsManager from './SettingsManager';
import TextMining from './TextMining';
import ETLJobsManager from './ETLJobsManager';
import ActiveDictionary from './ActiveDictionary';

const AdminPanel = () => {
    const [activeTab, setActiveTab] = useState('replace');

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="flex justify-between items-center mb-6 relative">
                    <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        <Cog6ToothIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                        <span className="hidden sm:inline">Admin Panel</span>
                        <span className="sm:hidden">Admin</span>
                    </h1>
                    <Navigation />
                </header>

                <div className="glass-card rounded-2xl overflow-hidden">
                    <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-thin">
                        <button
                            className={`px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'replace'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('replace')}
                        >
                            <span className="hidden sm:inline">Pending </span>Replace
                        </button>
                        <button
                            className={`px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'special'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('special')}
                        >
                            <span className="hidden sm:inline">Pending </span>Special
                        </button>
                        <button
                            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'dictionary'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('dictionary')}
                        >
                            <BookOpenIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Dictionary</span>
                        </button>
                        <button
                            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'currency'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('currency')}
                        >
                            <CurrencyDollarIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Currency</span>
                        </button>
                        <button
                            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'settings'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Cog6ToothIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </button>
                        <button
                            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'textmining'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('textmining')}
                        >
                            <MagnifyingGlassIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Mining</span>
                        </button>
                        <button
                            className={`flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-3 sm:py-4 font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 whitespace-nowrap cursor-pointer transition-colors ${activeTab === 'etl'
                                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                            onClick={() => setActiveTab('etl')}
                        >
                            <ClockIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">ETL Jobs</span>
                            <span className="sm:hidden">ETL</span>
                        </button>
                    </div>

                    <div className="p-3 sm:p-6">
                        {activeTab === 'replace' && <ReplaceWordsReview />}
                        {activeTab === 'special' && <SpecialWordsReview />}
                        {activeTab === 'dictionary' && <ActiveDictionary />}
                        {activeTab === 'currency' && <CurrencyRateManager />}
                        {activeTab === 'settings' && <SettingsManager />}
                        {activeTab === 'textmining' && <TextMining />}
                        {activeTab === 'etl' && <ETLJobsManager />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
