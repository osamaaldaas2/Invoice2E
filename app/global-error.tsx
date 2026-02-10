'use client';

export default function GlobalError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body style={{
                margin: 0,
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0a0e1a',
                color: '#e2e8f0',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    maxWidth: '400px',
                }}>
                    <h1 style={{
                        fontSize: '4rem',
                        fontWeight: 700,
                        background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        margin: '0 0 1rem',
                    }}>
                        500
                    </h1>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                        Something Went Wrong
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.5rem' }}>
                        An unexpected error occurred. Please try again.
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '9999px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                        }}
                    >
                        Try Again
                    </button>
                </div>
            </body>
        </html>
    );
}
