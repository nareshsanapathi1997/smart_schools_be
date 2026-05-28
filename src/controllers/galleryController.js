const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const notDeleted = 'deleted_at IS NULL';

function parseBool(val, defaultVal = false) {
  if (val === true || val === 'true') return true;
  if (val === false || val === 'false') return false;
  return defaultVal;
}

exports.getGallery = asyncHandler(async (req, res) => {
  const { category, type } = req.query;
  let query = `SELECT * FROM gallery WHERE ${notDeleted}`;
  const params = [];
  let i = 1;
  if (category) { query += ` AND category = $${i++}`; params.push(category); }
  if (type) { query += ` AND media_type = $${i++}`; params.push(type); }
  query += ' ORDER BY sort_order ASC, created_at DESC LIMIT 100';
  const result = await db.query(query, params);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows });
});

exports.createGalleryValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('media_url').optional({ checkFalsy: true }),
];

exports.updateGalleryValidation = [
  body('title').optional().trim().notEmpty(),
];

exports.createGallery = asyncHandler(async (req, res) => {
  const b = req.body;
  const media_url = req.file ? `/uploads/${req.file.filename}` : b.media_url;
  if (!media_url) {
    return res.status(422).json({ success: false, message: 'Media URL or file upload is required' });
  }
  const result = await db.query(
    `INSERT INTO gallery (title, description, media_url, media_type, category, is_featured, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      b.title,
      b.description || null,
      media_url,
      b.media_type || 'image',
      b.category || 'Campus',
      parseBool(b.is_featured),
      parseInt(b.sort_order, 10) || 0,
    ]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateGallery = asyncHandler(async (req, res) => {
  const b = req.body;
  const updates = [];
  const params = [];
  let i = 1;

  ['title', 'description', 'media_type', 'category'].forEach((field) => {
    if (b[field] !== undefined && b[field] !== '') {
      updates.push(`${field} = $${i++}`);
      params.push(b[field]);
    }
  });

  if (b.is_featured !== undefined) {
    updates.push(`is_featured = $${i++}`);
    params.push(parseBool(b.is_featured));
  }

  if (b.sort_order !== undefined) {
    updates.push(`sort_order = $${i++}`);
    params.push(parseInt(b.sort_order, 10) || 0);
  }

  if (req.file) {
    updates.push(`media_url = $${i++}`);
    params.push(`/uploads/${req.file.filename}`);
  } else if (b.media_url !== undefined && b.media_url !== '') {
    updates.push(`media_url = $${i++}`);
    params.push(b.media_url);
  }

  if (!updates.length) {
    return res.status(400).json({ success: false, message: 'No fields to update' });
  }

  updates.push('updated_at = NOW()');
  params.push(req.params.id);

  const result = await db.query(
    `UPDATE gallery SET ${updates.join(', ')} WHERE id = $${i} AND ${notDeleted} RETURNING *`,
    params
  );

  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Gallery item not found' });
  }

  res.json({ success: true, data: result.rows[0] });
});

exports.deleteGallery = asyncHandler(async (req, res) => {
  const result = await db.query(
    `UPDATE gallery SET deleted_at = NOW() WHERE id = $1 AND ${notDeleted} RETURNING id`,
    [req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Gallery item not found' });
  }
  res.json({ success: true, message: 'Deleted' });
});
