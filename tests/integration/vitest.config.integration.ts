/**
 * Vitest configuration for integration tests.
 *
 * Intent: Separate config with longer timeouts, sequential execution,
 * and node environment (no jsdom needed for DB tests).
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        include: ['tests/integration/**/*.integration.test.ts'],
        environment: 'node',
        globals: true,
        testTimeout: 60_000,
        hookTimeout: 120_000,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        sequence: {
            concurrent: false,
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../../'),
        },
    },
});
