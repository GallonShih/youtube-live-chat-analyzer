import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = 'yt_chat_analyzer_auth';
const ACCESS_TOKEN_KEY = 'yt_chat_analyzer_access_token';
const REFRESH_TOKEN_KEY = 'yt_chat_analyzer_refresh_token';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const AuthProvider = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Initialize from localStorage
    useEffect(() => {
        const initAuth = async () => {
            try {
                const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
                const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

                if (storedAccessToken) {
                    // Verify token with backend
                    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
                        headers: {
                            'Authorization': `Bearer ${storedAccessToken}`
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.role === 'admin') {
                            setAccessToken(storedAccessToken);
                            setIsAdmin(true);
                        } else {
                            // Token valid but not admin, clear tokens
                            clearTokens();
                        }
                    } else if (response.status === 401 && storedRefreshToken) {
                        // Try to refresh the token
                        const refreshed = await refreshAccessToken(storedRefreshToken);
                        if (!refreshed) {
                            clearTokens();
                        }
                    } else {
                        clearTokens();
                    }
                }
            } catch (err) {
                console.error('Failed to initialize auth:', err);
                clearTokens();
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();
    }, []);

    const clearTokens = () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.setItem(AUTH_STORAGE_KEY, 'guest');
        setAccessToken(null);
        setIsAdmin(false);
    };

    const saveTokens = (access, refresh) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, access);
        localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
        localStorage.setItem(AUTH_STORAGE_KEY, 'admin');
        setAccessToken(access);
        setIsAdmin(true);
    };

    const refreshAccessToken = async (refreshToken) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
                setAccessToken(data.access_token);
                setIsAdmin(true);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Failed to refresh token:', err);
            return false;
        }
    };

    const login = useCallback(async (password) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                const data = await response.json();
                saveTokens(data.access_token, data.refresh_token);
                return { success: true };
            } else {
                const errorData = await response.json();
                return { success: false, error: errorData.detail || '登入失敗' };
            }
        } catch (err) {
            console.error('Login error:', err);
            return { success: false, error: '網路錯誤，請稍後再試' };
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            if (accessToken) {
                await fetch(`${API_BASE_URL}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            clearTokens();
        }
    }, [accessToken]);

    const getAuthHeaders = useCallback(() => {
        if (accessToken) {
            return { 'Authorization': `Bearer ${accessToken}` };
        }
        return {};
    }, [accessToken]);

    const value = {
        isAdmin,
        role: isAdmin ? 'admin' : 'guest',
        login,
        logout,
        accessToken,
        getAuthHeaders,
        isLoading,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
