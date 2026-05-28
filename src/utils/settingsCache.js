const TTL_MS = 5 * 60 * 1000;
let cache = null;
let expiresAt = 0;

async function getCachedSettings(db) {
  if (cache && Date.now() < expiresAt) return cache;
  const result = await db.query('SELECT key, value, category FROM settings');
  cache = {};
  result.rows.forEach((r) => { cache[r.key] = r.value; });
  expiresAt = Date.now() + TTL_MS;
  return cache;
}

function invalidateSettingsCache() {
  cache = null;
  expiresAt = 0;
}

module.exports = { getCachedSettings, invalidateSettingsCache };
