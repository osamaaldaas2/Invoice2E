import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';

export default function NotFound(): React.ReactElement {
    return (
        <html>
            <body>
                <div className="min-h-screen flex flex-col items-center justify-center bg-background">
                    <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
                    <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
                    <p className="text-muted-foreground mb-8">
                        The page you&apos;re looking for doesn&apos;t exist.
                    </p>
                    <Link
                        href="/"
                        className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Return to {APP_NAME}
                    </Link>
                </div>
            </body>
        </html>
    );
}
