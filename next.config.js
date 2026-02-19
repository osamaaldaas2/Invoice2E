const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');
const path = require('path');
const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    pageExtensions: ['ts', 'tsx'],
    serverExternalPackages: ['tesseract.js'],
    experimental: {
        optimizePackageImports: ['@/lib', '@/components'],
        // FIX: Audit #047 — reduced from 200mb. Bulk ZIP limit is 500MB in constants,
        // but actual ZIP uploads typically < 100MB. Route-level validation enforces exact limits.
        proxyClientMaxBodySize: '100mb',
    },
    // Turbopack (next build): swap log-context.server with no-op stub in browser bundles
    turbopack: {
        resolveAlias: {
            '@/lib/log-context.server': { browser: '@/lib/log-context.stub' },
        },
    },
    // Webpack (next dev): same swap via NormalModuleReplacementPlugin for client builds
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.plugins.push(
                new webpack.NormalModuleReplacementPlugin(
                    /log-context\.server/,
                    path.resolve(__dirname, 'lib', 'log-context.stub.ts')
                )
            );
        }
        return config;
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'X-XSS-Protection', value: '0' },  // FIX: Re-audit #54 — CSP replaces deprecated XSS auditor
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
                    {
                        // FIX: Re-audit #55 — CSP with frame-ancestors, base-uri, form-action
                        key: 'Content-Security-Policy',
                        value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://api.stripe.com https://www.paypal.com https://*.supabase.co https://*.ingest.sentry.io; frame-src https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
                    }
                ]
            }
        ];
    },
};

module.exports = withNextIntl(nextConfig);
