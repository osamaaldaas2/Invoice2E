import { Client } from 'pg';
import { createHash } from 'crypto';
import { loadMigrationFiles } from './migration-files';

// No arbitrary-SQL RPC exposed through the public Data API.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* CI supplies environment. */
}
async function main() {
  const migrations = loadMigrationFiles();
  if (process.argv.includes('--dry-run')) {
    for (const m of migrations) console.log(`${m.directory}/${m.name}`);
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrations');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('invoice2e-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id serial PRIMARY KEY, filename text UNIQUE NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(), checksum text
    ); REVOKE ALL ON public.schema_migrations FROM PUBLIC, anon, authenticated;`);
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM public.schema_migrations'
    );
    const applied = new Set(rows.map((r) => r.filename));
    const history = await client.query(
      "SELECT to_regclass('supabase_migrations.schema_migrations') AS name"
    );
    const versions = new Set<string>();
    if (history.rows[0]?.name) {
      const result = await client.query(
        'SELECT version FROM supabase_migrations.schema_migrations'
      );
      for (const row of result.rows) versions.add(String(row.version));
    }
    for (const m of migrations) {
      const present =
        applied.has(m.name) ||
        (m.directory === 'supabase/migrations' && versions.has(m.name.split('_')[0]!));
      if (process.argv.includes('--status')) {
        console.log(`${present ? 'APPLIED' : 'PENDING'} ${m.directory}/${m.name}`);
        continue;
      }
      if (present) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(
          'INSERT INTO public.schema_migrations(filename,checksum) VALUES ($1,$2)',
          [m.name, createHash('sha256').update(m.sql).digest('hex')]
        );
        await client.query('COMMIT');
        console.log(`Applied ${m.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.name} failed`, { cause: error });
      }
    }
  } finally {
    await client.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
