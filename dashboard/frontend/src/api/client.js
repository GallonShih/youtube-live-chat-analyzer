const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const ACCESS_TOKEN_KEY = 'yt_chat_analyzer_access_token';
const REFRESH_TOKEN_KEY = 'yt_chat_analyzer_refresh_token';

let refreshPromise = null;

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            window.dispatchEvent(new CustomEvent('auth-logout'));
            return null;
        }

        const data = await response.json();
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        window.dispatchEvent(new CustomEvent('auth-token-refreshed'));
        return data.access_token;
    } catch {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.dispatchEvent(new CustomEvent('auth-logout'));
        return null;
    }
}

export async function authFetch(url, options = {}) {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const headers = { ...options.headers };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status !== 401) return response;

    // No refresh token available, return the 401
    if (!localStorage.getItem(REFRESH_TOKEN_KEY)) return response;

    // Concurrent refresh guard: only first 401 triggers refresh, others wait
    if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
        });
    }

    const newToken = await refreshPromise;

    if (!newToken) {
        return response;
    }

    // Retry original request with new token
    const retryHeaders = { ...options.headers, 'Authorization': `Bearer ${newToken}` };
    return fetch(url, { ...options, headers: retryHeaders });
}

export default API_BASE_URL;
