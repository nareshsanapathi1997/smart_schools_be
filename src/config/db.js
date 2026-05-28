const { Pool } = require('pg');
const config = require('./index');

const connectionString = config.db.connectionString;
const sslModeEnabled = /(?:^|[?&])sslmode\s*=\s*(require|verify-ca|verify-full)\b/i.test(connectionString || process.env.PGSSLMODE || '');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: sslModeEnabled || process.env.NODE_ENV === 'production'
    ? {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
      servername: config.db.tlsServername,
    }
    : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
