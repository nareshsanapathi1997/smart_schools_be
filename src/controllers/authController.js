const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const config = require('../config');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail } = require('../services/emailService');
const { logActivity } = require('../utils/activityLog');

const generateToken = (id) =>
  jwt.sign({ id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

exports.loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query(
    `SELECT u.*, r.name as role, r.permissions FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     WHERE u.email = $1 AND u.deleted_at IS NULL`,
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  await logActivity({ userId: user.id, action: 'login', entityType: 'user', entityId: user.id, ip: req.ip });

  const token = generateToken(user.id);
  res.cookie('token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
      },
    },
  });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

exports.logout = asyncHandler(async (_req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

exports.forgotPasswordValidation = [body('email').isEmail().normalizeEmail()];

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await db.query('SELECT id, name FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);

  if (result.rows.length) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, expires, result.rows[0].id]
    );
    const resetUrl = `${config.frontendUrl}/admin/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Password Reset - Smart School',
      html: `<p>Hi ${result.rows[0].name},</p><p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>Link expires in 1 hour.</p>`,
    });
  }

  res.json({ success: true, message: 'If email exists, reset link sent' });
});

exports.resetPasswordValidation = [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
];

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const result = await db.query(
    `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND deleted_at IS NULL`,
    [token]
  );

  if (!result.rows.length) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token' });
  }

  const hash = await bcrypt.hash(password, 12);
  await db.query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [hash, result.rows[0].id]
  );

  res.json({ success: true, message: 'Password reset successful' });
});

exports.getUsers = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT u.id, u.name, u.email, u.is_active, u.last_login, r.name as role, u.created_at
     FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC`
  );
  res.json({ success: true, data: result.rows });
});

exports.createUserValidation = [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').optional().trim().notEmpty(),
];

exports.createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'editor' } = req.body;
  const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
  if (!roleResult.rows.length) {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
  const hash = await bcrypt.hash(password, 12);

  const result = await db.query(
    `INSERT INTO users (role_id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
    [roleResult.rows[0]?.id, name, email, hash]
  );

  await logActivity({ userId: req.user?.id, action: 'create_user', entityType: 'user', entityId: result.rows[0].id, ip: req.ip });
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateUserValidation = [
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().trim().notEmpty(),
  body('is_active').optional().isBoolean(),
];

exports.updateUser = asyncHandler(async (req, res) => {
  const { name, email, role, is_active } = req.body;
  const target = await db.query('SELECT id, role_id FROM users WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!target.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

  let roleId = target.rows[0].role_id;
  if (role) {
    const roleResult = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (!roleResult.rows.length) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    roleId = roleResult.rows[0].id;
  }

  const result = await db.query(
    `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role_id = $3,
     is_active = COALESCE($4, is_active) WHERE id = $5 AND deleted_at IS NULL
     RETURNING id, name, email, is_active, last_login, created_at`,
    [name, email, roleId, is_active, req.params.id]
  );

  const withRole = await db.query(
    `SELECT u.id, u.name, u.email, u.is_active, u.last_login, u.created_at, r.name as role
     FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [req.params.id]
  );

  await logActivity({ userId: req.user.id, action: 'update_user', entityType: 'user', entityId: req.params.id, details: { name, email, role, is_active }, ip: req.ip });
  res.json({ success: true, data: withRole.rows[0] });
});

exports.deactivateUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
  }
  await db.query('UPDATE users SET is_active = FALSE, deleted_at = NOW() WHERE id = $1', [req.params.id]);
  await logActivity({ userId: req.user.id, action: 'deactivate_user', entityType: 'user', entityId: req.params.id, ip: req.ip });
  res.json({ success: true, message: 'User deactivated' });
});

exports.adminResetPasswordValidation = [body('password').isLength({ min: 8 })];

exports.adminResetPassword = asyncHandler(async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND deleted_at IS NULL', [hash, req.params.id]);
  await logActivity({ userId: req.user.id, action: 'reset_user_password', entityType: 'user', entityId: req.params.id, ip: req.ip });
  res.json({ success: true, message: 'Password updated' });
});
