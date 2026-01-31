import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function Home(): React.ReactElement {
    const t = useTranslations();

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-4">
            <div className="max-w-4xl mx-auto text-center">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
                    {t('home.title')}
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                    {t('home.description')}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        href="/auth/login"
                        className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity text-center"
                    >
                        {t('home.cta_login')}
                    </Link>
                    <Link
                        href="/auth/signup"
                        className="px-8 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium border border-border hover:bg-accent transition-colors text-center"
                    >
                        {t('home.cta_signup')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
