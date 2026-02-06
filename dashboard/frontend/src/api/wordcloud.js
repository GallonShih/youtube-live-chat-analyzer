import API_BASE_URL from './client';

const getAuthHeaders = () => {
    const token = localStorage.getItem('yt_chat_analyzer_access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Word Frequency
export const fetchWordFrequency = async ({ startTime, endTime, limit, excludeWords, replacementWordlistId, replacements }) => {
    let url = `${API_BASE_URL}/api/wordcloud/word-frequency`;
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    if (excludeWords && excludeWords.length > 0) {
        params.append('exclude_words', excludeWords.join(','));
    }
    // If replacements provided (ad-hoc), pass as JSON string. This overrides/augments ID on backend.
    if (replacements && replacements.length > 0) {
        params.append('replacements', JSON.stringify(replacements));
    }
    if (replacementWordlistId) {
        params.append('replacement_wordlist_id', replacementWordlistId);
    }

    const res = await fetch(`${url}?${params.toString()}`, {
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

// Wordlists
export const fetchWordlists = async () => {
    const res = await fetch(`${API_BASE_URL}/api/exclusion-wordlists`, {
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch wordlists');
    return res.json();
};

export const fetchWordlist = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`, {
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to load wordlist');
    return res.json();
};

export const createWordlist = async ({ name, words }) => {
    const res = await fetch(`${API_BASE_URL}/api/exclusion-wordlists`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ name, words })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '儲存失敗');
    }
    return res.json();
};

export const updateWordlist = async (id, { words }) => {
    const res = await fetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ words })
    });
    if (!res.ok) throw new Error('Failed to update wordlist');
    return res.json();
};

export const deleteWordlist = async (id) => {
    const res = await fetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete wordlist');
    return true;
};
