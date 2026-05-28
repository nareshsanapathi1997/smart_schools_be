require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Migrating events table...');
  await db.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS details TEXT');
  await db.query("ALTER TABLE events ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'");
  await db.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE');
  await db.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0');
  console.log('Events migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
