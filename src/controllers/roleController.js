const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity } = require('../utils/activityLog');

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const PROTECTED_ROLES = new Set(['super_admin']);

exports.getRoles = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT r.*, (SELECT COUNT(*)::int FROM users u WHERE u.role_id = r.id AND u.deleted_at IS NULL) AS user_count
     FROM roles r
     ORDER BY r.name ASC`
  );
  res.json({ success: true, data: result.rows });
});

exports.roleValidation = [
  body('name').trim().notEmpty().isLength({ max: 50 }),
  body('permissions').optional().isArray(),
];

exports.createRole = asyncHandler(async (req, res) => {
  const name = slugify(req.body.name);
  const permissions = req.body.permissions || [];

  if (PROTECTED_ROLES.has(name)) {
    return res.status(400).json({ success: false, message: 'This role name is reserved' });
  }

  const result = await db.query(
    `INSERT INTO roles (name, permissions) VALUES ($1, $2) RETURNING *`,
    [name, JSON.stringify(permissions)]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'create_role',
    entityType: 'role',
    entityId: String(result.rows[0].id),
    details: { name },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateRole = asyncHandler(async (req, res) => {
  const existing = await db.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
  if (!existing.rows.length) {
    return res.status(404).json({ success: false, message: 'Role not found' });
  }

  const row = existing.rows[0];
  const nextName = req.body.name !== undefined ? slugify(req.body.name) : row.name;

  if (PROTECTED_ROLES.has(row.name) && nextName !== row.name) {
    return res.status(400).json({ success: false, message: 'Cannot rename protected role' });
  }
  if (PROTECTED_ROLES.has(nextName) && row.name !== 'super_admin') {
    return res.status(400).json({ success: false, message: 'This role name is reserved' });
  }

  const permissions = req.body.permissions !== undefined ? req.body.permissions : row.permissions;

  const result = await db.query(
    `UPDATE roles SET name = $1, permissions = $2 WHERE id = $3 RETURNING *`,
    [nextName, JSON.stringify(permissions), req.params.id]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'update_role',
    entityType: 'role',
    entityId: String(req.params.id),
    ip: req.ip,
  });

  res.json({ success: true, data: result.rows[0] });
});

exports.deleteRole = asyncHandler(async (req, res) => {
  const existing = await db.query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
  if (!existing.rows.length) {
    return res.status(404).json({ success: false, message: 'Role not found' });
  }

  if (PROTECTED_ROLES.has(existing.rows[0].name)) {
    return res.status(400).json({ success: false, message: 'Cannot delete protected role' });
  }

  const users = await db.query(
    'SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (users.rows[0].count > 0) {
    return res.status(400).json({ success: false, message: 'Role is assigned to users. Reassign them first.' });
  }

  await db.query('DELETE FROM roles WHERE id = $1', [req.params.id]);

  await logActivity({
    userId: req.user?.id,
    action: 'delete_role',
    entityType: 'role',
    entityId: String(req.params.id),
    ip: req.ip,
  });

  res.json({ success: true, message: 'Role deleted' });
});
