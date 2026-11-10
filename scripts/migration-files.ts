import fs from 'fs';
import path from 'path';

/** Legacy schema first, then timestamped migrations. Shared by runner and DB tests. */
export function loadMigrationFiles(root = process.cwd()) {
  return ['db/migrations', 'supabase/migrations'].flatMap((directory) =>
    fs
      .readdirSync(path.join(root, directory))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((name) => ({
        name,
        directory,
        sql: fs.readFileSync(path.join(root, directory, name), 'utf8'),
      }))
  );
}
