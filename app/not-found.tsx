import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';

export default function NotFound(): React.ReactElement {
    return (
        <div className="flex-1 flex items-center justify-center px-4 py-24">
            <div className="text-center max-w-[min(400px,calc(100vw-2rem))]">
                <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold bg-gradient-to-br from-sky-400 to-indigo-500 bg-clip-text text-transparent mb-4">
                    404
                </h1>
                <h2 className="text-lg sm:text-xl font-semibold mb-2 text-white">
                    Page Not Found
                </h2>
                <p className="text-sm text-faded mb-6">
                    The page you&apos;re looking for doesn&apos;t exist.
                </p>
                <Link
                    href="/"
                    className="inline-block px-6 py-3 bg-gradient-to-br from-sky-400 to-indigo-500 text-white rounded-full font-semibold text-sm no-underline hover:opacity-90 transition-opacity"
                >
                    Return to {APP_NAME}
                </Link>
            </div>
        </div>
    );
}
