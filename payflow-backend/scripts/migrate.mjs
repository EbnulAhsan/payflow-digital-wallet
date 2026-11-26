// Applies migrations/*.up.sql in name order, once each, as the database owner.
// Same rules as deploy/migrate.sh, but in Node so it also runs in a Vercel build.
//   DIRECT_URL       direct (not pooled) connection string of the target database
//   APP_DB_PASSWORD  optional: sets the password of the payflow_app role
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = process.env.DIRECT_URL;
if (!url) {
  console.error('DIRECT_URL is not set.');
  process.exit(1);
}

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
);
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.up.sql'));
  for (const name of files.sort()) {
    const done = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (done.rowCount > 0) {
      console.log(`Already applied: ${name}`);
      continue;
    }
    console.log(`Applying: ${name}`);
    await client.query('BEGIN');
    try {
      await client.query(await readFile(path.join(dir, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        name,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  // Migration 001 creates payflow_app with a public dev password.
  // Replace it with a real secret wherever the app runs for real.
  if (process.env.APP_DB_PASSWORD) {
    const { rows } = await client.query(
      "SELECT format('ALTER ROLE payflow_app WITH PASSWORD %L', $1::text) AS sql",
      [process.env.APP_DB_PASSWORD],
    );
    await client.query(rows[0].sql);
    console.log('Set the payflow_app password from APP_DB_PASSWORD.');
  }
  console.log('Migrations are up to date.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}