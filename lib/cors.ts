/**
 * CORS Configuration
 * Handles Cross-Origin Resource Sharing settings for API routes
 */

// Allowed origins for CORS
const getAllowedOrigins = (): string[] => {
    const origins = (process.env.CORS_ALLOWED_ORIGINS?.split(',') || [])
        .map(origin => origin.trim())
        .filter(Boolean);

    // Always allow the app's own origin in production
    if (process.env.NEXT_PUBLIC_APP_URL) {
        origins.push(process.env.NEXT_PUBLIC_APP_URL.trim());
    }

    // In development, allow localhost
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:3000', 'http://127.0.0.1:3000');
    }

    return [...new Set(origins)]; // Remove duplicates
};

export const CORS_CONFIG = {
    allowedOrigins: getAllowedOrigins(),
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
    ],
    maxAge: 86400, // 24 hours
    credentials: true,
};

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
    if (!origin) return true; // Same-origin requests don't have Origin header

    const allowedOrigins = CORS_CONFIG.allowedOrigins;

    // If no origins configured, allow only same-origin in production
    if (allowedOrigins.length === 0) {
        return process.env.NODE_ENV !== 'production';
    }

    return allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': CORS_CONFIG.allowedMethods.join(', '),
        'Access-Control-Allow-Headers': CORS_CONFIG.allowedHeaders.join(', '),
        'Access-Control-Max-Age': CORS_CONFIG.maxAge.toString(),
        'Vary': 'Origin', // Important for caching when origin varies
    };

    if (CORS_CONFIG.credentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
    }

    // Only set Allow-Origin if origin is allowed
    if (origin && isOriginAllowed(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    return headers;
}
