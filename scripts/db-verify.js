// Reports migrations marked applied whose objects are missing — i.e. migrations the old
// db-migrate.js catch block recorded as done after they had actually rolled back.
// Usage: node scripts/db-verify.js
const fs = require('fs'); const path = require('path'); const { Client } = require('pg');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i === -1) continue;
    const k = t.slice(0, i).trim(); if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}
const dir = path.join(__dirname, '..', 'db', 'migrations');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const applied = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
  const live = new Set((await c.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => r.tablename));
  let bad = 0;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (!applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const want = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)].map(m => m[1].toLowerCase());
    const missing = [...new Set(want)].filter(t => !live.has(t));
    if (missing.length) { bad++; console.log(`MARKED APPLIED BUT MISSING: ${file} -> ${missing.join(', ')}`); }
  }
  console.log(bad ? `\n${bad} migration(s) lied. Re-run them after clearing their schema_migrations rows.`
                  : '\nAll applied migrations have their tables. Clean.');
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
