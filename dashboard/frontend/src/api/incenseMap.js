import API_BASE_URL from './client';

export const fetchIncenseCandidates = async () => {
    const res = await fetch(`${API_BASE_URL}/api/incense-map/candidates`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};
