const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const slugify = require('../utils/slugify');

const notDeleted = 'deleted_at IS NULL';

exports.getFaculty = asyncHandler(async (req, res) => {
  const { department, featured } = req.query;
  let query = `SELECT * FROM faculty WHERE ${notDeleted} AND is_active = TRUE`;
  const params = [];
  if (req.query.all === 'true') {
    query = `SELECT * FROM faculty WHERE ${notDeleted}`;
  }
  if (department) { query += ' AND department = $1'; params.push(department); }
  if (featured === 'true') query += ' AND is_featured = TRUE';
  query += ' ORDER BY sort_order ASC, name ASC LIMIT 50';
  const result = await db.query(query, params);
  if (req.query.all !== 'true') {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  }
  res.json({ success: true, data: result.rows });
});

exports.getFacultyMember = asyncHandler(async (req, res) => {
  let query = `SELECT * FROM faculty WHERE (slug = $1 OR id::text = $1) AND ${notDeleted}`;
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  const result = await db.query(query, [req.params.slug]);
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.createFacultyValidation = [body('name').trim().notEmpty()];

exports.createFaculty = asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = b.slug?.trim() || `${slugify(b.name)}-${Date.now().toString(36)}`;
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const result = await db.query(
    `INSERT INTO faculty (name, slug, designation, department, qualification, experience, bio, image_url, email, phone, social_links, is_featured, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [b.name, slug, b.designation, b.department, b.qualification, b.experience, b.bio, image_url, b.email, b.phone, JSON.stringify(b.social_links || {}), b.is_featured || false, b.is_active !== false, parseInt(b.sort_order, 10) || 0]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateFaculty = asyncHandler(async (req, res) => {
  const b = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const result = await db.query(
    `UPDATE faculty SET name=$1, slug=$2, designation=$3, department=$4, qualification=$5, experience=$6, bio=$7,
     image_url=COALESCE($8, image_url), email=$9, phone=$10, social_links=$11, is_featured=$12, is_active=$13, sort_order=$14
     WHERE id=$15 AND ${notDeleted} RETURNING *`,
    [b.name, b.slug, b.designation, b.department, b.qualification, b.experience, b.bio, image_url || null, b.email, b.phone, JSON.stringify(b.social_links || {}), b.is_featured, b.is_active ?? true, parseInt(b.sort_order, 10) || 0, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.deleteFaculty = asyncHandler(async (req, res) => {
  await db.query('UPDATE faculty SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Deleted' });
});
