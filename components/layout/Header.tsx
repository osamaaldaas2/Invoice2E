'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/lib/constants';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function Header(): React.ReactElement {
    const t = useTranslations('common');
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const userData = localStorage.getItem('user');
        if (userData) {
            try {
                setUser(JSON.parse(userData));
            } catch {
                // Invalid user data
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('user');
        setUser(null);
        router.push('/');
    };

    // Prevent hydration mismatch by not rendering auth buttons until mounted
    if (!mounted) {
        return (
            <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
                        {APP_NAME}
                    </Link>
                    <div className="flex items-center gap-4">
                        {/* Placeholder for hydration */}
                    </div>
                </nav>
            </header>
        );
    }

    return (
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
                    {APP_NAME}
                </Link>
                <div className="flex items-center gap-4">
                    {user ? (
                        <>
                            <span className="text-muted-foreground hidden sm:inline">
                                {user.firstName}
                            </span>
                            <Link
                                href="/dashboard"
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
                            >
                                Dashboard
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {t('logout')}
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/auth/login"
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {t('login')}
                            </Link>
                            <Link
                                href="/auth/signup"
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
                            >
                                {t('signup')}
                            </Link>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}
