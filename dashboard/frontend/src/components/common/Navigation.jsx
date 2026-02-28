import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    ChartBarIcon,
    PlayIcon,
    ArrowTrendingUpIcon,
    Cog6ToothIcon,
    Bars3Icon,
    XMarkIcon,
    UserIcon,
    ShieldCheckIcon,
    ChevronDownIcon,
    EyeIcon,
    EyeSlashIcon,
    FireIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

const Navigation = () => {
    const location = useLocation();
    const { isAdmin, login, logout } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showRoleMenu, setShowRoleMenu] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const roleMenuRef = useRef(null);
    const mobileRoleMenuRef = useRef(null);

    // Close role menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            const isInsideDesktopMenu = roleMenuRef.current?.contains(event.target);
            const isInsideMobileMenu = mobileRoleMenuRef.current?.contains(event.target);
            if (!isInsideDesktopMenu && !isInsideMobileMenu) {
                setShowRoleMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Define navItems inside component to filter based on role
    const navItems = [
        { path: '/', label: 'Dashboard', icon: ChartBarIcon },
        { path: '/playback', label: 'Playback', icon: PlayIcon },
        { path: '/trends', label: 'Trends', icon: ArrowTrendingUpIcon },
        { path: '/incense-map', label: 'Incense', icon: FireIcon },
        ...(isAdmin ? [{ path: '/admin', label: 'Admin', icon: Cog6ToothIcon }] : []),
    ];

    const isActive = (path) => location.pathname === path;

    const handleLogin = async () => {
        if (isSubmitting) return;

        setIsSubmitting(true);
        setLoginError('');

        try {
            const result = await login(password);
            if (result.success) {
                setShowLoginModal(false);
                setPassword('');
                setShowPassword(false);
                setLoginError('');
                setShowRoleMenu(false);
            } else {
                setLoginError(result.error);
            }
        } catch (err) {
            setLoginError('登入失敗，請稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogout = () => {
        logout();
        setShowRoleMenu(false);
    };

    const handleSwitchToAdmin = () => {
        setShowRoleMenu(false);
        setShowLoginModal(true);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !isSubmitting) {
            handleLogin();
        }
    };

    return (
        <>
            {/* Desktop Navigation */}
            <div className="hidden md:flex gap-2 lg:gap-3 items-center">
                {navItems.map(({ path, label, icon: Icon }) => (
                    <Link
                        key={path}
                        to={path}
                        className={`flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 font-semibold rounded-xl transition-all duration-200 cursor-pointer ${isActive(path)
                            ? 'bg-white/90 text-indigo-700 shadow-lg hover:bg-white hover:shadow-xl backdrop-blur-sm border border-white/50'
                            : 'glass-button text-gray-700'
                            }`}
                    >
                        <Icon className="w-5 h-5" />
                        <span className="hidden lg:inline">{label}</span>
                    </Link>
                ))}

                {/* Role Indicator & Dropdown */}
                <div className="ml-2 border-l border-gray-300/50 pl-3 relative" ref={roleMenuRef}>
                    <button
                        onClick={() => setShowRoleMenu(!showRoleMenu)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl glass-button transition-all duration-200 cursor-pointer ${isAdmin ? 'text-amber-700 hover:bg-amber-100/50' : 'text-gray-600 hover:bg-gray-100/50'
                            }`}
                    >
                        {isAdmin ? (
                            <ShieldCheckIcon className="w-5 h-5" />
                        ) : (
                            <UserIcon className="w-5 h-5" />
                        )}
                        <span className="hidden lg:inline text-sm font-medium">
                            {isAdmin ? 'Admin' : '訪客'}
                        </span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${showRoleMenu ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Role Dropdown Menu */}
                    {showRoleMenu && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                                <p className="text-xs text-gray-500">目前身份</p>
                                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                                    {isAdmin ? (
                                        <>
                                            <ShieldCheckIcon className="w-4 h-4 text-amber-600" />
                                            管理員
                                        </>
                                    ) : (
                                        <>
                                            <UserIcon className="w-4 h-4 text-gray-600" />
                                            訪客
                                        </>
                                    )}
                                </p>
                            </div>
                            <div className="py-1">
                                {isAdmin ? (
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                    >
                                        <UserIcon className="w-5 h-5 text-gray-500" />
                                        <span>切換為訪客</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleSwitchToAdmin}
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-amber-50 transition-colors cursor-pointer"
                                    >
                                        <ShieldCheckIcon className="w-5 h-5 text-amber-600" />
                                        <span>切換為管理員</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center gap-2 md:hidden">
                {/* Mobile Role Indicator */}
                <button
                    onClick={() => setShowRoleMenu(!showRoleMenu)}
                    className={`p-2 glass-button rounded-xl cursor-pointer ${isAdmin ? 'text-amber-700' : 'text-gray-600'}`}
                >
                    {isAdmin ? <ShieldCheckIcon className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                </button>

                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="p-2 glass-button rounded-xl cursor-pointer"
                    aria-label="Toggle menu"
                >
                    {mobileMenuOpen ? (
                        <XMarkIcon className="w-6 h-6 text-gray-700" />
                    ) : (
                        <Bars3Icon className="w-6 h-6 text-gray-700" />
                    )}
                </button>
            </div>

            {/* Mobile Role Menu */}
            {showRoleMenu && (
                <div ref={mobileRoleMenuRef} className="absolute top-full right-12 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 md:hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <p className="text-xs text-gray-500">目前身份</p>
                        <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            {isAdmin ? (
                                <>
                                    <ShieldCheckIcon className="w-4 h-4 text-amber-600" />
                                    管理員
                                </>
                            ) : (
                                <>
                                    <UserIcon className="w-4 h-4 text-gray-600" />
                                    訪客
                                </>
                            )}
                        </p>
                    </div>
                    <div className="py-1">
                        {isAdmin ? (
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                <UserIcon className="w-5 h-5 text-gray-500" />
                                <span>切換為訪客</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleSwitchToAdmin}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-gray-700 hover:bg-amber-50 transition-colors cursor-pointer"
                            >
                                <ShieldCheckIcon className="w-5 h-5 text-amber-600" />
                                <span>切換為管理員</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-48 glass-card rounded-xl shadow-xl z-50 md:hidden overflow-hidden">
                    {navItems.map(({ path, label, icon: Icon }) => (
                        <Link
                            key={path}
                            to={path}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${isActive(path)
                                ? 'bg-indigo-100 text-indigo-700 font-semibold'
                                : 'text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <Icon className="w-5 h-5" />
                            <span>{label}</span>
                        </Link>
                    ))}
                </div>
            )}

            {/* Login Modal */}
            {showLoginModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowLoginModal(false)}>
                    <div
                        className="bg-white rounded-2xl p-6 w-80 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2 mb-4">
                            <ShieldCheckIcon className="w-6 h-6 text-amber-600" />
                            <h3 className="text-lg font-bold text-gray-800">切換為管理員</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">請輸入管理員密碼</p>
                        <div className="relative mb-2">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="密碼"
                                className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                            >
                                {showPassword ? (
                                    <EyeSlashIcon className="w-5 h-5" />
                                ) : (
                                    <EyeIcon className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                        {loginError && (
                            <p className="text-red-500 text-sm mb-2">{loginError}</p>
                        )}
                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => {
                                    setShowLoginModal(false);
                                    setPassword('');
                                    setShowPassword(false);
                                    setLoginError('');
                                }}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleLogin}
                                disabled={isSubmitting}
                                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? '登入中...' : '登入'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Navigation;
