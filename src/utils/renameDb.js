require('dotenv').config();
const { Client } = require('pg');

const DB_HOST = process.env.DB_HOST || '192.168.0.226';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const OLD_NAME = process.argv[2] || 'db_name';
const NEW_NAME = process.argv[3] || 'smart_school';

const adminUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;

(async () => {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  const oldDb = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [OLD_NAME]);
  const newDb = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [NEW_NAME]);

  if (newDb.rows.length > 0) {
    console.log(`Database "${NEW_NAME}" already exists — no rename needed.`);
    await admin.end();
    return;
  }

  if (oldDb.rows.length === 0) {
    console.log(`Database "${OLD_NAME}" not found. Creating "${NEW_NAME}" instead...`);
    await admin.query(`CREATE DATABASE "${NEW_NAME}"`);
    console.log(`Database "${NEW_NAME}" created`);
    await admin.end();
    return;
  }

  await admin.query(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1 AND pid <> pg_backend_pid()
  `, [OLD_NAME]);

  await admin.query(`ALTER DATABASE "${OLD_NAME}" RENAME TO "${NEW_NAME}"`);
  console.log(`Renamed "${OLD_NAME}" → "${NEW_NAME}"`);

  await admin.end();
})().catch((err) => {
  console.error('Rename failed:', err.message);
  process.exit(1);
});
