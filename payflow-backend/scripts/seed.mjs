// Loads the demo seed (seed/seed.sql) and gives the demo users a known password.
//   DIRECT_URL         direct connection string of the target database
//   SEED_USER_PASSWORD password for every demo user (kept out of git)
// Run it on staging only: production gets just the admin account.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import pg from 'pg';

const url = process.env.DIRECT_URL;
const password = process.env.SEED_USER_PASSWORD;
if (!url || !password) {
  console.error('Set DIRECT_URL and SEED_USER_PASSWORD.');
  process.exit(1);
}

const seedFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'seed',
  'seed.sql',
);
const client = new pg.Client({ connectionString: url });

try {
  console.log(`Seeding ${new URL(url).host}`);
  await client.connect();
  await client.query(await readFile(seedFile, 'utf8'));
  await client.query(
    "UPDATE users SET password_hash = $1 WHERE email LIKE '%@payflow.test'",
    [await argon2.hash(password)],
  );
  console.log('Seed loaded; demo users can sign in with SEED_USER_PASSWORD.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}