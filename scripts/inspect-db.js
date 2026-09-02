const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

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
        if (!process.env[key]) process.env[key] = val;
      }
    }
  });
}

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://pos:pos@localhost:5432/kapmeta' });

async function run() {
  await client.connect();
  const tables = ['outlets', 'users', 'menu_items', 'modifier_options', 'ingredients', 'vendors', 'purchase_orders'];
  for (const t of tables) {
    const res = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'", [t]);
    console.log(`${t}.id:`, res.rows);
  }
  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
