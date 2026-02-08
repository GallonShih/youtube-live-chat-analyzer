import API_BASE_URL, { authFetch } from './client';

export const fetchReplacementWordlists = async () => {
    const res = await authFetch(`${API_BASE_URL}/api/replacement-wordlists`);
    if (!res.ok) throw new Error('Failed to fetch replacement wordlists');
    return res.json();
};

export const fetchReplacementWordlist = async (id) => {
    const res = await authFetch(`${API_BASE_URL}/api/replacement-wordlists/${id}`);
    if (!res.ok) throw new Error('Failed to load replacement wordlist');
    return res.json();
};

export const createReplacementWordlist = async ({ name, replacements }) => {
    const res = await authFetch(`${API_BASE_URL}/api/replacement-wordlists`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, replacements })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '儲存失敗');
    }
    return res.json();
};

export const updateReplacementWordlist = async (id, { name, replacements }) => {
    const body = {};
    if (name !== undefined) body.name = name;
    if (replacements !== undefined) body.replacements = replacements;

    const res = await authFetch(`${API_BASE_URL}/api/replacement-wordlists/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Failed to update replacement wordlist');
    return res.json();
};

export const deleteReplacementWordlist = async (id) => {
    const res = await authFetch(`${API_BASE_URL}/api/replacement-wordlists/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete replacement wordlist');
    return true;
};
