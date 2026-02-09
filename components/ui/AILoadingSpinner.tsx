'use client';

/**
 * Animated AI loading spinner:
 * Large 🤖 emoji with a green circle spinning around it.
 */
export default function AILoadingSpinner({ message }: { message?: string }) {
    return (
        <div className="flex flex-col items-center gap-4 py-6">
            <div className="relative inline-flex items-center justify-center">
                {/* Spinning green circle */}
                <svg
                    className="absolute animate-spin-slow"
                    width="120"
                    height="120"
                    viewBox="0 0 120 120"
                    fill="none"
                >
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke="rgba(74, 222, 128, 0.15)"
                        strokeWidth="4"
                    />
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        stroke="url(#greenGradient)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray="260 80"
                    />
                    <defs>
                        <linearGradient id="greenGradient" x1="0" y1="0" x2="120" y2="120">
                            <stop offset="0%" stopColor="#4ade80" />
                            <stop offset="50%" stopColor="#22c55e" />
                            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.2" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Robot emoji */}
                <span className="text-7xl animate-pulse-subtle select-none">🤖</span>
            </div>

            {message && (
                <p className="text-sm text-faded text-center animate-fade-in">
                    {message}
                </p>
            )}
        </div>
    );
}
