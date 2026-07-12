/**
 * Minimal migration runner: applies src/migrations/*.sql in filename order.
 * Usage: DATABASE_URL=postgres://... pnpm db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const [applied] = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
    if (applied) continue;
    const contents = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`applying ${file}`);
    await sql.unsafe(contents);
    await sql`INSERT INTO _migrations (name) VALUES (${file})`;
  }
  console.log('migrations up to date');
} finally {
  await sql.end({ timeout: 5 });
}
