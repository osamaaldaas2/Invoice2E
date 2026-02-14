/**
 * Database Migration Runner
 * 
 * Runs SQL migration files in order from db/migrations/.
 * Tracks applied migrations in a `schema_migrations` table.
 * 
 * Usage:
 *   npx tsx scripts/run-migrations.ts           # Run pending migrations
 *   npx tsx scripts/run-migrations.ts --status   # Show migration status
 *   npx tsx scripts/run-migrations.ts --dry-run  # Show what would run without executing
 * 
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (from .env.local)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load env from .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'db', 'migrations');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function ensureMigrationsTable(): Promise<void> {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum TEXT
      );
    `,
  });

  if (error) {
    // If RPC doesn't exist, try direct SQL via REST
    console.warn('⚠️  Could not create schema_migrations table via RPC.');
    console.warn('   Create it manually in Supabase SQL editor:');
    console.warn('   CREATE TABLE IF NOT EXISTS schema_migrations (');
    console.warn('     id SERIAL PRIMARY KEY,');
    console.warn('     filename TEXT NOT NULL UNIQUE,');
    console.warn('     applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),');
    console.warn('     checksum TEXT');
    console.warn('   );');
  }
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('filename')
    .order('filename', { ascending: true });

  if (error) {
    // Table might not exist yet
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return new Set();
    }
    throw new Error(`Failed to query schema_migrations: ${error.message}`);
  }

  return new Set((data || []).map((m: { filename: string }) => m.filename));
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Alphabetical = sequential (001_, 002_, etc.)
}

function computeChecksum(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isDryRun = args.includes('--dry-run');

  console.log('📦 Invoice2E Migration Runner\n');

  const allFiles = getMigrationFiles();
  const applied = await getAppliedMigrations();

  if (isStatus) {
    console.log(`Total migrations: ${allFiles.length}`);
    console.log(`Applied: ${applied.size}`);
    console.log(`Pending: ${allFiles.length - applied.size}\n`);

    for (const file of allFiles) {
      const status = applied.has(file) ? '✅' : '⏳';
      console.log(`  ${status} ${file}`);
    }
    return;
  }

  const pending = allFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date.\n');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);
  for (const file of pending) {
    console.log(`  ⏳ ${file}`);
  }
  console.log('');

  if (isDryRun) {
    console.log('🏃 Dry run — no changes made.\n');
    return;
  }

  await ensureMigrationsTable();

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = computeChecksum(sql);

    console.log(`▶️  Running: ${file} ...`);

    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
      console.error(`❌ Migration failed: ${file}`);
      console.error(`   Error: ${error.message}`);
      console.error('\n   Fix the issue and re-run. Already-applied migrations will be skipped.');
      process.exit(1);
    }

    // Record the migration
    const { error: recordError } = await supabase
      .from('schema_migrations')
      .insert({ filename: file, checksum });

    if (recordError) {
      console.warn(`⚠️  Migration ran but could not record: ${recordError.message}`);
    }

    console.log(`   ✅ ${file} applied successfully`);
  }

  console.log(`\n✅ All ${pending.length} migration(s) applied successfully.\n`);
}

main().catch((err) => {
  console.error('❌ Migration runner failed:', err);
  process.exit(1);
});
