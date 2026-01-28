import API_BASE_URL from './client';

export const fetchEmojiStats = async ({ startTime, endTime, limit, offset, filter, typeFilter }) => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    if (limit) params.append('limit', limit);
    if (offset !== undefined) params.append('offset', offset);
    if (filter) params.append('filter', filter);
    if (typeFilter) params.append('type_filter', typeFilter);

    const response = await fetch(`${API_BASE_URL}/api/emojis/stats?${params}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
};
