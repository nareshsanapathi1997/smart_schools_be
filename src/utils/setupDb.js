require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_HOST = process.env.DB_HOST || '192.168.0.226';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || '123456';
const DB_NAME = process.env.DB_NAME || 'smart_school';

const adminUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
const appUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

async function setup() {
  const admin = new Client({ connectionString: adminUrl });

  try {
    await admin.connect();
    console.log('Connected to PostgreSQL server');

    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (exists.rows.length === 0) {
      await admin.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`Database "${DB_NAME}" created`);
    } else {
      console.log(`Database "${DB_NAME}" already exists`);
    }
  } finally {
    await admin.end();
  }

  const app = new Client({ connectionString: appUrl });
  try {
    await app.connect();
    console.log(`Connected to "${DB_NAME}"`);

    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await app.query(schema);
    console.log('Schema applied successfully');
  } finally {
    await app.end();
  }

  console.log('\nDone! DATABASE_URL=' + appUrl);
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
