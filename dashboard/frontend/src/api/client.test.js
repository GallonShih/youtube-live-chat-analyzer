import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const ACCESS_TOKEN_KEY = 'yt_chat_analyzer_access_token';
const REFRESH_TOKEN_KEY = 'yt_chat_analyzer_refresh_token';
const API_BASE_URL = 'http://localhost:8000';

const importClientModule = async () => {
    vi.resetModules();
    return import('./client');
};

describe('authFetch', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    test('adds authorization header with access token for normal requests', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'token-a');
        const fetchMock = vi.fn().mockResolvedValue({
            status: 200,
            ok: true,
            json: async () => ({ ok: true }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { authFetch } = await importClientModule();
        const response = await authFetch(`${API_BASE_URL}/api/chat/messages`);

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a');
    });

    test('returns original 401 when refresh token is missing', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'token-a');
        const unauthorizedResponse = { status: 401, ok: false };
        const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse);
        vi.stubGlobal('fetch', fetchMock);

        const { authFetch } = await importClientModule();
        const response = await authFetch(`${API_BASE_URL}/api/chat/messages`);

        expect(response).toBe(unauthorizedResponse);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('refreshes access token once and retries original request', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');

        const fetchMock = vi.fn(async (url, options = {}) => {
            if (url === `${API_BASE_URL}/api/auth/refresh`) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'new-token' }),
                };
            }

            if (options.headers?.Authorization === 'Bearer new-token') {
                return { ok: true, status: 200, json: async () => ({ ok: true }) };
            }

            return { ok: false, status: 401, json: async () => ({ detail: 'expired' }) };
        });
        vi.stubGlobal('fetch', fetchMock);

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const { authFetch } = await importClientModule();

        const response = await authFetch(`${API_BASE_URL}/api/chat/messages`);

        expect(response.status).toBe(200);
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-token');
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock.mock.calls[1][0]).toBe(`${API_BASE_URL}/api/auth/refresh`);
        expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new-token');
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth-token-refreshed' }));
    });

    test('shares a single refresh request when multiple calls get 401 concurrently', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');

        let refreshResolve;
        const refreshPromise = new Promise((resolve) => {
            refreshResolve = resolve;
        });

        const fetchMock = vi.fn(async (url, options = {}) => {
            if (url === `${API_BASE_URL}/api/auth/refresh`) {
                await refreshPromise;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'new-token' }),
                };
            }

            if (options.headers?.Authorization === 'Bearer new-token') {
                return { ok: true, status: 200, json: async () => ({ ok: true }) };
            }

            return { ok: false, status: 401, json: async () => ({ detail: 'expired' }) };
        });
        vi.stubGlobal('fetch', fetchMock);

        const { authFetch } = await importClientModule();

        const req1 = authFetch(`${API_BASE_URL}/api/chat/messages?req=1`);
        const req2 = authFetch(`${API_BASE_URL}/api/chat/messages?req=2`);

        // Allow both requests to hit refresh branch before resolving refresh promise.
        await Promise.resolve();
        await Promise.resolve();
        refreshResolve();

        const [res1, res2] = await Promise.all([req1, req2]);
        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === `${API_BASE_URL}/api/auth/refresh`);
        expect(refreshCalls).toHaveLength(1);
    });

    test('clears tokens and dispatches logout when refresh fails', async () => {
        localStorage.setItem(ACCESS_TOKEN_KEY, 'old-token');
        localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-token');

        const fetchMock = vi.fn(async (url) => {
            if (url === `${API_BASE_URL}/api/auth/refresh`) {
                return {
                    ok: false,
                    status: 401,
                    json: async () => ({ detail: 'invalid refresh token' }),
                };
            }
            return { ok: false, status: 401, json: async () => ({ detail: 'expired' }) };
        });
        vi.stubGlobal('fetch', fetchMock);

        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const { authFetch } = await importClientModule();

        const response = await authFetch(`${API_BASE_URL}/api/chat/messages`);

        expect(response.status).toBe(401);
        expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth-logout' }));
    });
});
