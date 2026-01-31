/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    pageExtensions: ['ts', 'tsx'],
    swcMinify: true,
    experimental: {
        optimizePackageImports: ['@/lib', '@/components'],
    },
}

module.exports = nextConfig
