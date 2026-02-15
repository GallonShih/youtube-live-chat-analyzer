import React, { useEffect, useRef } from 'react';
import { PlusIcon, TrashIcon, XMarkIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const DEFAULT_COLORS = ['#ff4d4f', '#faad14', '#52c41a', '#1677ff', '#722ed1', '#eb2f96'];

let nextId = 1;

const createEmptyMarker = () => ({
    id: nextId++,
    startTime: '',
    endTime: '',
    label: '',
    color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
});

/**
 * Normalize a date string to datetime-local format (YYYY-MM-DDTHH:mm).
 * Accepts ISO 8601, "YYYY/MM/DD HH:mm", "YYYY-MM-DD HH:mm", etc.
 */
function normalizeDateTime(raw) {
    if (!raw) return '';
    // Replace slashes with dashes for Date parsing
    const cleaned = raw.trim().replace(/\//g, '-');
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const startIdx = header.findIndex((h) => ['starttime', 'start_time', 'start'].includes(h));
    const endIdx = header.findIndex((h) => ['endtime', 'end_time', 'end'].includes(h));
    const labelIdx = header.findIndex((h) => ['label', 'name', 'description', 'text'].includes(h));
    const colorIdx = header.findIndex((h) => ['color', 'colour'].includes(h));

    if (startIdx === -1 || endIdx === -1) return [];

    return lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
            id: nextId++,
            startTime: normalizeDateTime(cols[startIdx]),
            endTime: normalizeDateTime(cols[endIdx]),
            label: labelIdx !== -1 ? cols[labelIdx] || '' : '',
            color: (colorIdx !== -1 && cols[colorIdx]?.startsWith('#'))
                ? cols[colorIdx]
                : DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
        };
    }).filter((m) => m.startTime && m.endTime);
}

function parseJSON(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [];
    return arr.map((item) => ({
        id: nextId++,
        startTime: normalizeDateTime(item.startTime || item.start_time || item.start || ''),
        endTime: normalizeDateTime(item.endTime || item.end_time || item.end || ''),
        label: item.label || item.name || item.description || item.text || '',
        color: (item.color && item.color.startsWith('#'))
            ? item.color
            : DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    })).filter((m) => m.startTime && m.endTime);
}

const EventMarkerModal = ({ isOpen, onClose, markers, setMarkers, showLabels, setShowLabels }) => {
    const modalRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') onClose();
            };
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAdd = () => {
        setMarkers((prev) => [...prev, createEmptyMarker()]);
    };

    const handleRemove = (id) => {
        setMarkers((prev) => prev.filter((m) => m.id !== id));
    };

    const handleChange = (id, field, value) => {
        setMarkers((prev) =>
            prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
        );
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            let imported = [];
            try {
                if (file.name.endsWith('.json')) {
                    imported = parseJSON(text);
                } else {
                    imported = parseCSV(text);
                }
            } catch {
                alert('檔案格式錯誤，請確認格式是否正確');
                return;
            }

            if (imported.length === 0) {
                alert('未找到有效的標記資料');
                return;
            }

            setMarkers((prev) => [...prev, ...imported]);
        };
        reader.readAsText(file);
        // Reset so the same file can be re-uploaded
        e.target.value = '';
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={modalRef}
                className="glass-modal rounded-2xl max-w-2xl w-full overflow-hidden transform transition-all"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-bold text-gray-900">事件標記管理</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                        <XMarkIcon className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    {markers.length === 0 ? (
                        <p className="text-center text-gray-400 py-8 text-sm">
                            尚無事件標記，點擊下方按鈕新增或上傳檔案
                        </p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100">
                                    <th className="pb-2 pr-2">開始時間</th>
                                    <th className="pb-2 pr-2">結束時間</th>
                                    <th className="pb-2 pr-2">說明</th>
                                    <th className="pb-2 pr-2 w-10">顏色</th>
                                    <th className="pb-2 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {markers.map((marker) => (
                                    <tr key={marker.id} className="border-b border-gray-50">
                                        <td className="py-2 pr-2">
                                            <input
                                                type="datetime-local"
                                                step="60"
                                                value={marker.startTime}
                                                onChange={(e) =>
                                                    handleChange(marker.id, 'startTime', e.target.value)
                                                }
                                                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <input
                                                type="datetime-local"
                                                step="60"
                                                value={marker.endTime}
                                                onChange={(e) =>
                                                    handleChange(marker.id, 'endTime', e.target.value)
                                                }
                                                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <input
                                                type="text"
                                                value={marker.label}
                                                onChange={(e) =>
                                                    handleChange(marker.id, 'label', e.target.value)
                                                }
                                                placeholder="事件名稱"
                                                className="border border-gray-300 rounded-md px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <input
                                                type="color"
                                                value={marker.color}
                                                onChange={(e) =>
                                                    handleChange(marker.id, 'color', e.target.value)
                                                }
                                                className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                            />
                                        </td>
                                        <td className="py-2">
                                            <button
                                                onClick={() => handleRemove(marker.id)}
                                                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                title="刪除"
                                            >
                                                <TrashIcon className="w-4 h-4 text-red-500" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAdd}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                            <PlusIcon className="w-4 h-4" />
                            新增標記
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.csv"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            title="支援 JSON 或 CSV 格式"
                        >
                            <ArrowUpTrayIcon className="w-4 h-4" />
                            上傳檔案
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={showLabels}
                                onChange={(e) => setShowLabels(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-sm text-gray-700">常駐顯示文字</span>
                        </label>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                        >
                            關閉
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventMarkerModal;
