'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/lib/user-context';

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
    const { user, loading } = useUser();

    const dashboardPath = '/dashboard';
    const loginPath = '/login';
    const adminPath = '/admin';

    const redirectUnauthorized = useCallback(() => {
        router.push(dashboardPath);
    }, [dashboardPath, router]);

    const redirectToLogin = useCallback(() => {
        const returnUrl = encodeURIComponent(pathname || adminPath);
        router.push(`${loginPath}?returnUrl=${returnUrl}`);
    }, [adminPath, loginPath, pathname, router]);

    useEffect(() => {
        if (loading) return;

        if (!user) {
            redirectToLogin();
            return;
        }

        const isAdmin = ['admin', 'super_admin'].includes(user.role || '');
        const isSuperAdmin = user.role === 'super_admin';

        if (!isAdmin) {
            redirectUnauthorized();
            return;
        }

        if (requireSuperAdmin && !isSuperAdmin) {
            redirectUnauthorized();
        }
    }, [loading, user, redirectToLogin, redirectUnauthorized, requireSuperAdmin]);

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

    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const isSuperAdmin = user?.role === 'super_admin';

    if (!user || !isAdmin || (requireSuperAdmin && !isSuperAdmin)) {
        return null;
    }

    return <>{children}</>;
}
