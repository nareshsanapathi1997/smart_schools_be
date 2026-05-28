require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Migrating courses table...');
  await db.query("ALTER TABLE courses ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'");
  console.log('Courses migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
