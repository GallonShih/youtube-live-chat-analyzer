import API_BASE_URL, { authFetch } from './client';

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

    const res = await authFetch(`${url}?${params.toString()}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
};

// Wordlists
export const fetchWordlists = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/exclusion-wordlists`);
    if (!res.ok) throw new Error('Failed to fetch wordlists');
    return res.json();
};

export const fetchWordlist = async (id) => {
    const res = await authFetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`);
    if (!res.ok) throw new Error('Failed to load wordlist');
    return res.json();
};

export const createWordlist = async ({ name, words }) => {
    const res = await authFetch(`${API_BASE_URL}/api/exclusion-wordlists`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
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
    const res = await authFetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ words })
    });
    if (!res.ok) throw new Error('Failed to update wordlist');
    return res.json();
};

export const deleteWordlist = async (id) => {
    const res = await authFetch(`${API_BASE_URL}/api/exclusion-wordlists/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete wordlist');
    return true;
};
