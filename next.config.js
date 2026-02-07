const withNextIntl = require('next-intl/plugin')('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    pageExtensions: ['ts', 'tsx'],
    experimental: {
        optimizePackageImports: ['@/lib', '@/components'],
    },
};

module.exports = withNextIntl(nextConfig);
