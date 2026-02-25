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
                    // CSP is defined in middleware.ts as the single source of truth [F-015]
                ]
            }
        ];
    },
};

module.exports = withNextIntl(nextConfig);
