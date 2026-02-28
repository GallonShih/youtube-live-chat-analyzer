import API_BASE_URL from './client';

export const fetchIncenseCandidates = async ({ startTime, endTime } = {}) => {
    const params = new URLSearchParams();
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    const query = params.toString() ? `?${params}` : '';
    const res = await fetch(`${API_BASE_URL}/api/incense-map/candidates${query}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};
