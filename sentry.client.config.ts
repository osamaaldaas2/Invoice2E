import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 0.1,

    // Capture Replay for 10% of all sessions,
    // plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // Only send errors that matter
    beforeSend(event) {
        // Don't send events in development
        if (process.env.NODE_ENV !== 'production') {
            return null;
        }

        // Filter out certain errors
        if (event.exception?.values?.[0]?.type === 'ChunkLoadError') {
            return null; // Don't send chunk load errors
        }

        return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
        'ResizeObserver loop',
        'Non-Error promise rejection',
        'Network request failed',
        'Load failed',
        'cancelled',
    ],
});
