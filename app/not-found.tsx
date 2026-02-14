import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
    const t = await getTranslations('errorPages.notFound');

    return (
        <div className="flex-1 flex items-center justify-center px-4 py-24">
            <div className="text-center max-w-[min(400px,calc(100vw-2rem))]">
                <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-br from-sky-400 to-indigo-500 bg-clip-text text-transparent mb-4">
                    404
                </h1>
                <h2 className="text-lg sm:text-xl font-semibold mb-2 text-white">
                    {t('title')}
                </h2>
                <p className="text-sm text-faded mb-6">
                    {t('description')}
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-gradient-to-br from-sky-400 to-indigo-500 text-white rounded-full font-semibold text-sm no-underline hover:opacity-90 transition-opacity"
                >
                    {t('backHome')}
                </Link>
            </div>
        </div>
    );
}
