const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function ensurePortalAccounts(studentId, admissionNo) {
  const defaultPass = await bcrypt.hash(String(admissionNo).slice(-4).padStart(4, '0'), 10);
  const parentUser = `${admissionNo}_parent`;
  for (const [type, username] of [['parent', parentUser], ['student', admissionNo]]) {
    await db.query(
      `INSERT INTO portal_accounts (account_type, student_id, username, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_type, username) DO NOTHING`,
      [type, studentId, username, defaultPass]
    );
  }
}

module.exports = { ensurePortalAccounts };
