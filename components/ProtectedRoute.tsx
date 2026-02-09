'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { fetchSessionUser } from '@/lib/client-auth';

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
    const locale = useLocale();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);

    const localizedFallback = useMemo(() => {
        if (!fallbackUrl.startsWith('/')) {
            return `/${locale}/${fallbackUrl}`;
        }
        if (fallbackUrl.startsWith(`/${locale}/`) || fallbackUrl === `/${locale}`) {
            return fallbackUrl;
        }
        return `/${locale}${fallbackUrl}`;
    }, [fallbackUrl, locale]);

    const redirectToLogin = useCallback(() => {
        // Redirect with return URL so user can continue after login
        const returnUrl = encodeURIComponent(pathname || `/${locale}/dashboard`);
        router.push(`${localizedFallback}?returnUrl=${returnUrl}`);
    }, [localizedFallback, pathname, router]);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    redirectToLogin();
                    return;
                }

                setIsAuthorized(true);
            } catch {
                redirectToLogin();
            } finally {
                setLoading(false);
            }
        };

        checkAuth();
    }, [redirectToLogin]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
            </div>
        );
    }

    if (!isAuthorized) {
        return null;
    }

    return <>{children}</>;
}
