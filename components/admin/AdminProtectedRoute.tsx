'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

type AdminProtectedRouteProps = {
    children: React.ReactNode;
    requireSuperAdmin?: boolean;
};

/**
 * Admin Protected Route Component
 * Verifies user has admin role before rendering children
 * Redirects to dashboard if not authorized
 */
export default function AdminProtectedRoute({
    children,
    requireSuperAdmin = false,
}: AdminProtectedRouteProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);

    const redirectUnauthorized = useCallback(() => {
        // Redirect non-admins to dashboard
        router.push('/dashboard');
    }, [router]);

    const redirectToLogin = useCallback(() => {
        localStorage.removeItem('user');
        const returnUrl = encodeURIComponent(pathname || '/admin');
        router.push(`/login?returnUrl=${returnUrl}`);
    }, [pathname, router]);

    useEffect(() => {
        const checkAdminAuth = async () => {
            try {
                // Check local storage first
                const userData = localStorage.getItem('user');
                if (!userData) {
                    redirectToLogin();
                    return;
                }

                // Verify session with backend
                const response = await fetch('/api/auth/me', {
                    credentials: 'include',
                });

                if (response.status === 401) {
                    redirectToLogin();
                    return;
                }

                if (!response.ok) {
                    console.warn('Auth check failed');
                    redirectUnauthorized();
                    return;
                }

                const { data } = await response.json();

                // Check role
                const isAdmin = ['admin', 'super_admin'].includes(data.role);
                const isSuperAdmin = data.role === 'super_admin';

                if (!isAdmin) {
                    console.warn('User is not an admin');
                    redirectUnauthorized();
                    return;
                }

                if (requireSuperAdmin && !isSuperAdmin) {
                    console.warn('Super admin required');
                    redirectUnauthorized();
                    return;
                }

                // Update local storage with role
                const user = JSON.parse(userData);
                user.role = data.role;
                localStorage.setItem('user', JSON.stringify(user));

                setIsAuthorized(true);
            } catch (error) {
                console.error('Admin auth check error:', error);
                redirectUnauthorized();
            } finally {
                setLoading(false);
            }
        };

        checkAdminAuth();
    }, [redirectToLogin, redirectUnauthorized, requireSuperAdmin]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto" />
                    <p className="mt-4 text-gray-600 dark:text-gray-400">
                        Verifying admin access...
                    </p>
                </div>
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    return <>{children}</>;
}
