/**
 * Migration Runner Script
 * Usage: npx ts-node scripts/run-migration.ts
 *
 * Note: This script requires the Supabase service role key
 * Migrations should be run through Supabase dashboard or CLI in production
 */

import * as fs from 'fs';
import * as path from 'path';

// Logger implementation for script (can't use module import in standalone script)
const logger = {
    info: (message: string, data?: Record<string, unknown>): void => {
        const entry = {
            timestamp: new Date().toISOString(),
            level: 'INFO',
            message,
            ...(data && { data }),
        };
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(entry));
    },
    error: (message: string, error?: unknown): void => {
        const entry = {
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message,
            error: error instanceof Error ? error.message : String(error),
        };
        // eslint-disable-next-line no-console
        console.error(JSON.stringify(entry));
    },
};

async function runMigration(): Promise<void> {
    const migrationPath = path.join(process.cwd(), 'db/migrations/001_initial_schema.sql');

    // Check if migration file exists
    if (!fs.existsSync(migrationPath)) {
        logger.error('Migration file not found', { path: migrationPath });
        process.exit(1);
    }

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    logger.info('Migration file loaded', { path: migrationPath, size: sqlContent.length });
    logger.info('='.repeat(50));
    logger.info('MIGRATION INSTRUCTIONS');
    logger.info('='.repeat(50));
    logger.info('To run this migration:');
    logger.info('1. Open Supabase Dashboard: https://supabase.com/dashboard');
    logger.info('2. Navigate to your project');
    logger.info('3. Go to SQL Editor');
    logger.info('4. Create a new query');
    logger.info('5. Paste the contents of db/migrations/001_initial_schema.sql');
    logger.info('6. Click "Run" to execute the migration');
    logger.info('='.repeat(50));
    logger.info('Alternatively, use Supabase CLI:');
    logger.info('  supabase db push');
    logger.info('='.repeat(50));

    // Output the SQL for reference
    logger.info('Migration SQL Preview (first 500 chars):', { preview: sqlContent.substring(0, 500) });
}

runMigration().catch((error) => {
    logger.error('Migration script failed', error);
    process.exit(1);
});
