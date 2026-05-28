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

exports.getLookups = asyncHandler(async (req, res) => {
  const { type, all } = req.query;
  if (!type) {
    return res.status(400).json({ success: false, message: 'type query parameter is required' });
  }

  let query = `
    SELECT id, type, code, label, metadata, sort_order, is_active, created_at, updated_at
    FROM lookup_values
    WHERE type = $1 AND deleted_at IS NULL
  `;
  const params = [type];

  if (all !== 'true') {
    query += ' AND is_active = TRUE';
  }

  query += ' ORDER BY sort_order ASC, label ASC';

  const result = await db.query(query, params);
  res.json({ success: true, data: result.rows });
});

exports.lookupValidation = [
  body('type').trim().notEmpty(),
  body('label').trim().notEmpty(),
  body('code').optional().trim(),
  body('sort_order').optional().isInt({ min: 0 }),
  body('is_active').optional().isBoolean(),
  body('metadata').optional(),
];

exports.createLookup = asyncHandler(async (req, res) => {
  const { type, label, code, sort_order = 0, is_active = true, metadata = {} } = req.body;
  const finalCode = slugify(code || label);

  const result = await db.query(
    `INSERT INTO lookup_values (type, code, label, metadata, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [type, finalCode, label.trim(), JSON.stringify(metadata || {}), parseInt(sort_order, 10) || 0, is_active !== false]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'create_lookup',
    entityType: 'lookup_value',
    entityId: String(result.rows[0].id),
    details: { type, code: finalCode },
    ip: req.ip,
  });

  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateLookup = asyncHandler(async (req, res) => {
  const existing = await db.query(
    'SELECT * FROM lookup_values WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!existing.rows.length) {
    return res.status(404).json({ success: false, message: 'Lookup not found' });
  }

  const row = existing.rows[0];
  const { label, code, sort_order, is_active, metadata } = req.body;
  const finalCode = code !== undefined ? slugify(code || label || row.label) : row.code;

  const result = await db.query(
    `UPDATE lookup_values
     SET label = COALESCE($1, label),
         code = $2,
         sort_order = COALESCE($3, sort_order),
         is_active = COALESCE($4, is_active),
         metadata = COALESCE($5, metadata)
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING *`,
    [
      label?.trim(),
      finalCode,
      sort_order !== undefined ? parseInt(sort_order, 10) : null,
      is_active,
      metadata !== undefined ? JSON.stringify(metadata) : null,
      req.params.id,
    ]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'update_lookup',
    entityType: 'lookup_value',
    entityId: String(req.params.id),
    ip: req.ip,
  });

  res.json({ success: true, data: result.rows[0] });
});

exports.deleteLookup = asyncHandler(async (req, res) => {
  const result = await db.query(
    'UPDATE lookup_values SET deleted_at = NOW(), is_active = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Lookup not found' });
  }

  await logActivity({
    userId: req.user?.id,
    action: 'delete_lookup',
    entityType: 'lookup_value',
    entityId: String(req.params.id),
    ip: req.ip,
  });

  res.json({ success: true, message: 'Lookup deleted' });
});
