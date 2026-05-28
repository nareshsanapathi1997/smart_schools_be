require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const db = await c.query('SELECT current_database() AS db');
  const tables = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  );
  const counts = await c.query(`
    SELECT
      (SELECT COUNT(*) FROM roles) AS roles,
      (SELECT COUNT(*) FROM settings) AS settings,
      (SELECT COUNT(*) FROM chatbot_faqs) AS faqs,
      (SELECT COUNT(*) FROM users) AS users
  `);

  console.log('Connected:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
  console.log('Database:', db.rows[0].db);
  console.log('Tables created:', tables.rows.length);
  console.log(tables.rows.map((r) => r.table_name).join(', '));
  console.log('Seed data:', counts.rows[0]);

  await c.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
