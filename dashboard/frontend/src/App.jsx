import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/common/Toast';
import Spinner from './components/common/Spinner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './features/dashboard/Dashboard';
import AdminPanel from './features/admin/AdminPanel';
import PlaybackPage from './features/playback/PlaybackPage';
import TrendsPage from './features/trends/TrendsPage';
import AuthorPage from './features/authors/AuthorPage';
import AuthorMessageClassificationPage from './features/authors/AuthorMessageClassificationPage';
import IncenseMapPage from './features/incense-map/IncenseMapPage';

// Protected Route component for admin-only pages
const ProtectedRoute = ({ children }) => {
    const { isAdmin, isLoading } = useAuth();

    // Wait for auth initialization before deciding whether to redirect.
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return children;
};

function AppRoutes() {
    return (
        <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/admin" element={
                <ProtectedRoute>
                    <AdminPanel />
                </ProtectedRoute>
            } />
            <Route path="/playback" element={<PlaybackPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/authors/:authorId" element={<AuthorPage />} />
            <Route path="/authors/:authorId/classify" element={<AuthorMessageClassificationPage />} />
            <Route path="/incense-map" element={<IncenseMapPage />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <BrowserRouter>
                    <AppRoutes />
                </BrowserRouter>
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
