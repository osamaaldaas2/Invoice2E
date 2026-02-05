'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type ProtectedRouteProps = {
    children: React.ReactNode;
    fallbackUrl?: string;
};

/**
 * FIX (BUG-036): Enhanced session validation
 * - Verifies session with backend, not just localStorage
 * - Handles expired sessions properly
 * - Redirects to login with return URL
 */
export default function ProtectedRoute({
    children,
    fallbackUrl = '/login',
}: ProtectedRouteProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);

    const redirectToLogin = useCallback(() => {
        // Clear local storage on session expiry
        localStorage.removeItem('user');
        // Redirect with return URL so user can continue after login
        const returnUrl = encodeURIComponent(pathname || '/dashboard');
        router.push(`${fallbackUrl}?returnUrl=${returnUrl}`);
    }, [fallbackUrl, pathname, router]);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const user = localStorage.getItem('user');

                if (!user) {
                    redirectToLogin();
                    return;
                }

                // Verify session is still valid on backend
                const response = await fetch('/api/auth/me', {
                    credentials: 'include',
                });

                if (response.status === 401) {
                    // Session expired or invalid
                    redirectToLogin();
                    return;
                }

                if (!response.ok) {
                    // Other error, but don't log out - might be temporary
                    console.warn('Auth check failed, continuing with local session');
                }

                setIsAuthorized(true);
            } catch (error) {
                // Network error - allow access based on localStorage
                // This enables offline usage for cached pages
                console.warn('Auth check network error:', error);
                const user = localStorage.getItem('user');
                if (user) {
                    setIsAuthorized(true);
                } else {
                    redirectToLogin();
                }
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [redirectToLogin]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    return <>{children}</>;
}
