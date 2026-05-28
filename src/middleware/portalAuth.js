const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const protectPortal = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  else if (req.cookies?.portal_token) token = req.cookies.portal_token;

  if (!token) return res.status(401).json({ success: false, message: 'Not authorized' });

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.type !== 'portal') return res.status(401).json({ success: false, message: 'Invalid portal token' });

    const result = await db.query(
      `SELECT pa.*, s.student_name, s.class_level, s.section, s.admission_no, s.parent_name, s.parent_phone
       FROM portal_accounts pa
       JOIN students s ON s.id = pa.student_id
       WHERE pa.id = $1 AND pa.is_active = TRUE AND s.deleted_at IS NULL`,
      [decoded.accountId]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, message: 'Account not found' });

    req.portal = { ...result.rows[0], account_type: decoded.accountType };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = { protectPortal };
