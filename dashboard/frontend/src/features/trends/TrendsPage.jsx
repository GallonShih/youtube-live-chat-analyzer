import React, { useState, useEffect, useCallback } from 'react';
import {
    ArrowTrendingUpIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    EyeIcon,
    ChartBarIcon,
} from '@heroicons/react/24/outline';
import Navigation from '../../components/common/Navigation';
import { useAuth } from '../../contexts/AuthContext';
import WordGroupCard from './WordGroupCard';
import TrendChart from './TrendChart';
import {
    fetchWordTrendGroups,
    createWordTrendGroup,
    updateWordTrendGroup,
    deleteWordTrendGroup,
    fetchTrendStats
} from '../../api/wordTrends';
import { formatLocalHour } from '../../utils/formatters';
import { useDefaultStartTime } from '../../hooks/useDefaultStartTime';

const TrendsPage = () => {
    const { isAdmin } = useAuth();
    const { defaultStartTime, loading: defaultPeriodLoading } = useDefaultStartTime();

    // Word Groups state
    const [groups, setGroups] = useState([]);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [visibleGroups, setVisibleGroups] = useState(new Set());
    const [loadingGroups, setLoadingGroups] = useState(true);

    // Chart ordering state
    const [chartOrder, setChartOrder] = useState([]);
    const [draggedId, setDraggedId] = useState(null);

    // Time filter state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Trend data state
    const [trendData, setTrendData] = useState({});
    const [loadingTrends, setLoadingTrends] = useState(false);

    // Chart display options
    const [lineWidth, setLineWidth] = useState(2);
    const [showPoints, setShowPoints] = useState(true);

    // Apply default period
    const [defaultApplied, setDefaultApplied] = useState(false);
    useEffect(() => {
        if (defaultPeriodLoading || defaultApplied) return;
        setDefaultApplied(true);
        if (defaultStartTime) {
            setStartDate(defaultStartTime);
            setEndDate(formatLocalHour(new Date()));
        }
    }, [defaultPeriodLoading, defaultStartTime, defaultApplied]);

    // Load groups on mount
    useEffect(() => {
        loadGroups();
    }, []);

    const loadGroups = async () => {
        try {
            setLoadingGroups(true);
            const data = await fetchWordTrendGroups();
            setGroups(data);
            // Default all groups to hidden; user opt-in per group
            setVisibleGroups(new Set());
            // Initialize chart order
            setChartOrder(data.map(g => g.id));
        } catch (err) {
            console.error('Failed to load groups:', err);
        } finally {
            setLoadingGroups(false);
        }
    };

    // Load trend data when groups or time filter changes
    const loadTrendData = useCallback(async () => {
        const visibleGroupIds = Array.from(visibleGroups);
        if (visibleGroupIds.length === 0) {
            setTrendData({});
            return;
        }

        try {
            setLoadingTrends(true);

            let startTime = null;
            let endTime = null;

            if (startDate) {
                startTime = new Date(startDate).toISOString();
            }
            if (endDate) {
                const d = new Date(endDate);
                d.setMinutes(59, 59, 999);
                endTime = d.toISOString();
            }

            const result = await fetchTrendStats({
                groupIds: visibleGroupIds,
                startTime,
                endTime
            });

            // Convert to map for easy lookup
            const dataMap = {};
            result.groups.forEach(g => {
                dataMap[g.group_id] = g;
            });
            setTrendData(dataMap);
        } catch (err) {
            console.error('Failed to load trend data:', err);
        } finally {
            setLoadingTrends(false);
        }
    }, [visibleGroups, startDate, endDate]);

    // Trigger trend data load when visible groups or time changes
    useEffect(() => {
        if (groups.length > 0 && visibleGroups.size > 0) {
            loadTrendData();
        }
    }, [groups, visibleGroups, loadTrendData]);

    // Handlers
    const handleSaveGroup = async (groupData) => {
        if (groupData.id) {
            // Update existing
            const updated = await updateWordTrendGroup(groupData.id, groupData);
            setGroups(prev => prev.map(g => g.id === updated.id ? updated : g));
        } else {
            // Create new
            const created = await createWordTrendGroup(groupData);
            setGroups(prev => [...prev, created]);
            setChartOrder(prev => [...prev, created.id]);
            setIsAddingNew(false);
        }
    };

    const handleDeleteGroup = async (id) => {
        await deleteWordTrendGroup(id);
        setGroups(prev => prev.filter(g => g.id !== id));
        setVisibleGroups(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        setChartOrder(prev => prev.filter(gid => gid !== id));
        setTrendData(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleToggleVisibility = (id) => {
        setVisibleGroups(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleFilter = () => {
        loadTrendData();
    };

    const handleClearFilter = () => {
        // Reset to default 24h range
        setQuickRange(24);
    };

    const handleSortByMessageVolume = () => {
        setChartOrder(prev => {
            const visibleIds = prev.filter(id => visibleGroups.has(id));
            const hiddenIds = prev.filter(id => !visibleGroups.has(id));

            const getTotalCount = (groupId) => {
                const groupData = trendData[groupId];
                if (!groupData) return 0;
                if (typeof groupData.total_count === 'number') return groupData.total_count;
                if (!Array.isArray(groupData.data)) return 0;
                return groupData.data.reduce((sum, item) => sum + (item.count || 0), 0);
            };

            visibleIds.sort((a, b) => getTotalCount(b) - getTotalCount(a));
            return [...visibleIds, ...hiddenIds];
        });
    };

    // Quick time range setters
    const setQuickRange = (hours) => {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        setStartDate(formatLocalHour(start));
        setEndDate(formatLocalHour(end));
    };

    // Drag and drop handlers for chart reordering
    const handleDragStart = (e, id) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, id) => {
        e.preventDefault();
        if (draggedId === null || draggedId === id) return;

        setChartOrder(prev => {
            const newOrder = [...prev];
            const draggedIdx = newOrder.indexOf(draggedId);
            const targetIdx = newOrder.indexOf(id);

            if (draggedIdx === -1 || targetIdx === -1) return prev;

            newOrder.splice(draggedIdx, 1);
            newOrder.splice(targetIdx, 0, draggedId);

            return newOrder;
        });
    };

    const handleDragEnd = () => {
        setDraggedId(null);
    };

    // Get ordered visible groups
    const orderedVisibleGroups = chartOrder
        .filter(id => visibleGroups.has(id))
        .map(id => groups.find(g => g.id === id))
        .filter(Boolean);

    return (
        <div className="min-h-screen font-sans text-gray-900">
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                {/* Header with Navigation */}
                <header className="flex justify-between items-center mb-6 relative">
                    <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-white drop-shadow-lg">
                        <ArrowTrendingUpIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                        <span>詞彙趨勢分析</span>
                    </h1>
                    <Navigation />
                </header>

                {/* Time Filter Section */}
                <div className="glass-card p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 w-full sm:w-auto">時間範圍:</label>

                        {/* Quick range buttons */}
                        <button
                            onClick={() => setQuickRange(24)}
                            className="bg-gray-200 hover:bg-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm text-gray-700 font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            24H
                        </button>
                        <button
                            onClick={() => setQuickRange(72)}
                            className="bg-gray-200 hover:bg-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm text-gray-700 font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            3天
                        </button>
                        <button
                            onClick={() => setQuickRange(168)}
                            className="bg-gray-200 hover:bg-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm text-gray-700 font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            7天
                        </button>

                        <div className="hidden sm:block w-px h-6 bg-gray-300 mx-1" />

                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1 sm:flex-none min-w-0"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            placeholder="開始時間"
                        />
                        <span className="text-gray-500 font-medium text-sm">→</span>
                        <input
                            type="datetime-local"
                            step="3600"
                            className="border border-gray-300 rounded-md px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1 sm:flex-none min-w-0"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            max={formatLocalHour(new Date())}
                            placeholder="結束時間"
                        />
                        <button
                            onClick={handleFilter}
                            className="flex items-center gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-6 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-semibold shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer"
                        >
                            <MagnifyingGlassIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">篩選</span>
                        </button>
                        {(startDate || endDate) && (
                            <button
                                onClick={handleClearFilter}
                                className="flex items-center gap-1 text-red-600 hover:text-red-700 text-sm font-medium underline transition-colors cursor-pointer"
                            >
                                <XMarkIcon className="w-4 h-4" />
                                <span>清除</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Word Groups Management Panel */}
                    <div className="lg:col-span-1 order-2 lg:order-1">
                        <div className="glass-card rounded-2xl p-3 sm:p-4">
                            <div className="flex items-center justify-between mb-3 sm:mb-4">
                                <h2 className="text-base sm:text-lg font-semibold text-gray-800">詞彙組管理</h2>
                                {isAdmin && (
                                    <button
                                        onClick={() => setIsAddingNew(true)}
                                        disabled={isAddingNew}
                                        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                    >
                                        + 新增
                                    </button>
                                )}
                            </div>

                            {loadingGroups ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                    <p className="mt-3 text-gray-500 text-sm">載入詞彙組...</p>
                                </div>
                            ) : (
                                <>
                                    {/* New group card */}
                                    {isAddingNew && (
                                        <WordGroupCard
                                            isNew={true}
                                            onSave={handleSaveGroup}
                                            onCancel={() => setIsAddingNew(false)}
                                            isVisible={true}
                                            isAdmin={isAdmin}
                                        />
                                    )}

                                    {/* Existing groups */}
                                    {groups.map(group => (
                                        <WordGroupCard
                                            key={group.id}
                                            group={group}
                                            onSave={handleSaveGroup}
                                            onDelete={handleDeleteGroup}
                                            isVisible={visibleGroups.has(group.id)}
                                            onToggleVisibility={handleToggleVisibility}
                                            isAdmin={isAdmin}
                                        />
                                    ))}

                                    {groups.length === 0 && !isAddingNew && (
                                        <div className="text-center text-gray-500 py-8">
                                            <p className="mb-2">尚無詞彙組</p>
                                            {isAdmin && <p className="text-sm">點擊「+ 新增」建立第一個詞彙組</p>}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Charts Panel */}
                    <div className="lg:col-span-2 order-1 lg:order-2">
                        <div className="glass-panel rounded-2xl p-3 sm:p-4 min-h-[300px] sm:min-h-[400px]">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-3 sm:mb-4">
                                <h2 className="text-base sm:text-lg font-semibold text-gray-800">趨勢圖表</h2>
                                <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                                    {/* Line width control */}
                                    <div className="flex items-center gap-1 sm:gap-2">
                                        <label className="text-xs text-gray-500 hidden sm:inline">線條粗細:</label>
                                        <select
                                            value={lineWidth}
                                            onChange={(e) => setLineWidth(Number(e.target.value))}
                                            className="border border-gray-300 rounded px-2 py-1 text-xs sm:text-sm"
                                        >
                                            <option value={1}>細 (1px)</option>
                                            <option value={2}>中 (2px)</option>
                                            <option value={3}>粗 (3px)</option>
                                            <option value={4}>特粗 (4px)</option>
                                        </select>
                                    </div>
                                    {/* Show points toggle */}
                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showPoints}
                                            onChange={(e) => setShowPoints(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        顯示資料點
                                    </label>
                                    <button
                                        onClick={handleSortByMessageVolume}
                                        disabled={visibleGroups.size < 2}
                                        className="px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    >
                                        依訊息量排序
                                    </button>
                                    {loadingTrends && (
                                        <div className="flex items-center gap-2 text-sm text-indigo-600">
                                            <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                            <span>更新中...</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {visibleGroups.size === 0 ? (
                                <div className="text-center text-gray-500 py-16">
                                    <ChartBarIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                    <p>請選擇要顯示的詞彙組</p>
                                    <p className="text-sm mt-2 flex items-center justify-center gap-1">
                                        在左側點擊 <EyeIcon className="w-4 h-4" /> 圖示來顯示/隱藏圖表
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {orderedVisibleGroups.map(group => {
                                        const data = trendData[group.id];
                                        return (
                                            <div
                                                key={group.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, group.id)}
                                                onDragOver={(e) => handleDragOver(e, group.id)}
                                                onDragEnd={handleDragEnd}
                                                className={`transition-opacity ${draggedId === group.id ? 'opacity-50' : ''}`}
                                            >
                                                <TrendChart
                                                    name={group.name}
                                                    color={group.color}
                                                    data={data?.data || []}
                                                    startTime={startDate ? new Date(startDate).toISOString() : null}
                                                    endTime={endDate ? new Date(endDate).toISOString() : null}
                                                    lineWidth={lineWidth}
                                                    showPoints={showPoints}
                                                    dragHandleProps={{
                                                        onMouseDown: (e) => e.stopPropagation()
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrendsPage;
