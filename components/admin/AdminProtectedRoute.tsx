'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { fetchSessionUser } from '@/lib/client-auth';

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

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

    const dashboardPath = useMemo(() => `/${locale}/dashboard`, [locale]);
    const loginPath = useMemo(() => `/${locale}/login`, [locale]);
    const adminPath = useMemo(() => `/${locale}/admin`, [locale]);

    const redirectUnauthorized = useCallback(() => {
        // Redirect non-admins to dashboard
        router.push(dashboardPath);
    }, [dashboardPath, router]);

    const redirectToLogin = useCallback(() => {
        const returnUrl = encodeURIComponent(pathname || adminPath);
        router.push(`${loginPath}?returnUrl=${returnUrl}`);
    }, [adminPath, loginPath, pathname, router]);

    useEffect(() => {
        const checkAdminAuth = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    redirectToLogin();
                    return;
                }

                // Check role
                const isAdmin = ['admin', 'super_admin'].includes(sessionUser.role || '');
                const isSuperAdmin = sessionUser.role === 'super_admin';

                if (!isAdmin) {
                    redirectUnauthorized();
                    return;
                }

                if (requireSuperAdmin && !isSuperAdmin) {
                    redirectUnauthorized();
                    return;
                }

                setIsAuthorized(true);
            } catch {
                redirectUnauthorized();
            } finally {
                setLoading(false);
            }
        };

        checkAdminAuth();
    }, [redirectToLogin, redirectUnauthorized, requireSuperAdmin]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto" />
                    <p className="mt-4 text-faded">
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
