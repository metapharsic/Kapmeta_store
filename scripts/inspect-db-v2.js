// One-off diagnostic: dump live id/outlet_id column types + table existence
// for every table this session's migrations (0040-0045) touch or reference,
// after discovering outlets.id is TEXT live despite every migration file
// declaring UUID (see db/migrations/0045_repair_0002_item_availability.sql
// failure: 42804 FK type mismatch, uuid vs text). Run once from a real
// terminal (device_bash can't reach the DB) so the next repair migration is
// written against ground truth instead of another guess.
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

const TABLES = [
  'outlets', 'organizations', 'users', 'menu_items', 'categories', 'menu_categories',
  'ingredients', 'vendors', 'purchase_orders', 'purchase_order_items', 'recipes',
  'channel_accounts', 'integrations', 'item_availability', 'availability_schedules',
  'order_payments', 'orders', 'item_channel_prices', 'daily_stock_closings',
  'stock_purchases', 'stock_purchase_items', 'stock_consumptions', 'stock_consumption_items',
  'item_commissions', 'addon_commissions', 'physical_menu_files',
];

async function run() {
  await client.connect();

  const { rows: existing } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [TABLES]
  );
  const existingSet = new Set(existing.map((r) => r.table_name));
  console.log('=== table existence ===');
  for (const t of TABLES) {
    console.log(`${t}: ${existingSet.has(t) ? 'EXISTS' : 'MISSING'}`);
  }

  console.log('\n=== id / outlet_id column types (existing tables only) ===');
  for (const t of TABLES) {
    if (!existingSet.has(t)) continue;
    const res = await client.query(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_name = $1 AND column_name IN ('id', 'outlet_id', 'item_id', 'integration_id', 'channel_id')
       ORDER BY column_name`,
      [t]
    );
    console.log(`${t}:`, JSON.stringify(res.rows));
  }

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
