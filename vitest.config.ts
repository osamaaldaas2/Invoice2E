import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 80,
                statements: 80,
            },
            exclude: [
                'node_modules/**',
                'tests/**',
                '**/*.d.ts',
                '**/*.config.*',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
