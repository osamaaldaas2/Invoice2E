'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/lib/user-context';

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
    const { user, loading } = useUser();

    const localizedFallback = fallbackUrl.startsWith('/') ? fallbackUrl : '/' + fallbackUrl;

    const redirectToLogin = useCallback(() => {
        const returnUrl = encodeURIComponent(pathname || '/dashboard');
        router.push(`${localizedFallback}?returnUrl=${returnUrl}`);
    }, [localizedFallback, pathname, router]);

    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return <>{children}</>;
}
