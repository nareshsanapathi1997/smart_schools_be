require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Migrating achievements table...');
  await db.query('ALTER TABLE achievements ADD COLUMN IF NOT EXISTS rank_order INTEGER DEFAULT 0');
  await db.query("ALTER TABLE achievements ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'award'");
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_achievements_topper_year ON achievements(year, rank_order)
    WHERE deleted_at IS NULL AND entry_type = 'topper'
  `);
  await db.query(`
    UPDATE achievements SET entry_type = 'topper'
    WHERE student_name IS NOT NULL AND student_name <> '' AND entry_type = 'award'
  `);
  console.log('Achievements migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
