'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { fetchSessionUser } from '@/lib/client-auth';

type HeroActionsProps = {
    locale: string;
};

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function HeroActions({ locale }: HeroActionsProps) {
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);

    const withLocale = useMemo(() => {
        return (path: string) => {
            if (!path.startsWith('/')) {
                return `/${locale}/${path}`;
            }
            if (path === '/') {
                return `/${locale}`;
            }
            if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
                return path;
            }
            return `/${locale}${path}`;
        };
    }, [locale]);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                setUser(sessionUser);
            } catch {
                setUser(null);
            }
        };
        void loadUser();
    }, [pathname]);

    if (user) {
        return (
            <div className="flex justify-center gap-4 flex-wrap">
                <Link
                    href={withLocale('/dashboard')}
                    className="px-8 py-4 rounded-full font-semibold text-base md:text-lg bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_18px_40px_-24px_rgba(56,189,248,0.7)] hover:brightness-110 transition"
                >
                    Go to Dashboard
                </Link>
                <Link
                    href={withLocale('/upload')}
                    className="px-8 py-4 rounded-full font-semibold text-base md:text-lg border border-white/20 text-white bg-white/5 hover:bg-white/10 transition"
                >
                    Upload Invoice
                </Link>
            </div>
        );
    }

    return (
        <div className="flex justify-center gap-4 flex-wrap">
            <Link
                href={withLocale('/signup')}
                className="px-8 py-4 rounded-full font-semibold text-base md:text-lg bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_18px_40px_-24px_rgba(56,189,248,0.7)] hover:brightness-110 transition"
            >
                Get Started Free
            </Link>
            <Link
                href={withLocale('/login')}
                className="px-8 py-4 rounded-full font-semibold text-base md:text-lg border border-white/20 text-white bg-white/5 hover:bg-white/10 transition"
            >
                Login
            </Link>
        </div>
    );
}
