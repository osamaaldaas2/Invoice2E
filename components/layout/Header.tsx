import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/lib/constants';

export default function Header(): React.ReactElement {
    const t = useTranslations('common');

    return (
        <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
                    {APP_NAME}
                </Link>
                <div className="flex items-center gap-4">
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
                </div>
            </nav>
        </header>
    );
}
