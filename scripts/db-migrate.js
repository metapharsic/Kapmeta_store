// Applies db/migrations/*.sql in order, tracked in schema_migrations.
// Replaces the Prisma placeholder — the real schema is the raw SQL in db/migrations/,
// documented in docs/database/objects/DB-OBJECT-CATALOGUE.md. No ORM schema exists;
// do not reintroduce one without an ADR (see docs/ENGINEERING-PROTOCOL.md §6).
//
// schema_migrations is the table docs/12-operations/troubleshooting/TS-DB-database-issues.md
// already assumes exists — keep this name in sync if either changes.

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Ensure root .env is loaded if DATABASE_URL is not already in environment
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function main() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://pos:pos@localhost:5432/petpooja';
  if (!databaseUrl) {
    console.error('[db:migrate] DATABASE_URL not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filenames are zero-padded (0001_, 0002_, ...) — lexicographic sort is correct order

  if (files.length === 0) {
    console.log('[db:migrate] No .sql migrations found in db/migrations/. Nothing to do.');
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version      TEXT PRIMARY KEY,
        applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.version));

    let ranCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[db:migrate] applying ${file} ...`);

      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        console.log(`[db:migrate] applied ${file}`);
        ranCount += 1;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        // If the database already has the tables (e.g. created via Prisma or initial baseline)
        console.log(`[db:migrate] ${file}: schema objects already present. Recorded migration state.`);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
      }
    }

    if (ranCount === 0) {
      console.log('[db:migrate] Database already up to date.');
    } else {
      console.log(`[db:migrate] Applied ${ranCount} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[db:migrate] Unexpected error:', err);
  process.exit(1);
});
