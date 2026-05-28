const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const protectTeacher = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], config.jwt.secret);
    if (decoded.type !== 'teacher') return res.status(401).json({ success: false, message: 'Invalid token' });
    const result = await db.query(
      `SELECT ta.*, f.name AS faculty_name, f.department FROM teacher_accounts ta
       LEFT JOIN faculty f ON f.id = ta.faculty_id WHERE ta.id = $1 AND ta.is_active = TRUE`,
      [decoded.accountId]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, message: 'Account not found' });
    req.teacher = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = { protectTeacher };
