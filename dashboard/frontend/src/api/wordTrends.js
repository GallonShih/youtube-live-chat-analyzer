import API_BASE_URL from './client';

const getAuthHeaders = () => {
    const token = localStorage.getItem('yt_chat_analyzer_access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

export const fetchWordTrendGroups = async () => {
    const res = await fetch(`${API_BASE_URL}/api/word-trends/groups`, {
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch word trend groups');
    return res.json();
};

export const fetchWordTrendGroup = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/word-trends/groups/${id}`, {
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load word trend group');
    return res.json();
};

export const createWordTrendGroup = async ({ name, words, color }) => {
    const res = await fetch(`${API_BASE_URL}/api/word-trends/groups`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ name, words, color })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '儲存失敗');
    }
    return res.json();
};

export const updateWordTrendGroup = async (id, { name, words, color }) => {
    const body = {};
    if (name !== undefined) body.name = name;
    if (words !== undefined) body.words = words;
    if (color !== undefined) body.color = color;

    const res = await fetch(`${API_BASE_URL}/api/word-trends/groups/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '更新失敗');
    }
    return res.json();
};

export const deleteWordTrendGroup = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/word-trends/groups/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete word trend group');
    return true;
};

export const fetchTrendStats = async ({ groupIds, startTime, endTime }) => {
    const body = { group_ids: groupIds };
    if (startTime) body.start_time = startTime;
    if (endTime) body.end_time = endTime;

    const res = await fetch(`${API_BASE_URL}/api/word-trends/stats`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Failed to fetch trend stats');
    return res.json();
};
