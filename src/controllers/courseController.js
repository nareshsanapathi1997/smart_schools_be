const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const slugify = require('../utils/slugify');

const notDeleted = 'deleted_at IS NULL';

function parseJsonField(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

exports.getCourses = asyncHandler(async (req, res) => {
  const { class: classLevel, featured, search } = req.query;
  let query = `SELECT * FROM courses WHERE ${notDeleted}`;
  const params = [];
  let i = 1;

  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  if (classLevel) { query += ` AND class_level = $${i++}`; params.push(classLevel); }
  if (featured === 'true') query += ' AND is_featured = TRUE';
  if (search) {
    query += ` AND (title ILIKE $${i} OR description ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  query += ' ORDER BY sort_order ASC, title ASC';
  const safeLimit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
  query += ` LIMIT $${i++}`;
  params.push(safeLimit);

  const result = await db.query(query, params);
  if (req.query.all !== 'true') {
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  }
  res.json({ success: true, data: result.rows });
});

exports.getCourse = asyncHandler(async (req, res) => {
  let query = `SELECT * FROM courses WHERE (slug = $1 OR id::text = $1) AND ${notDeleted}`;
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  const result = await db.query(query, [req.params.slug]);
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Course not found' });
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows[0] });
});

exports.createCourseValidation = [
  body('title').trim().notEmpty(),
  body('class_level').optional().trim(),
];

exports.createCourse = asyncHandler(async (req, res) => {
  const {
    title, description, class_level, eligibility,
    duration, is_featured, is_active, sort_order,
  } = req.body;
  const subjects = parseJsonField(req.body.subjects, []);
  const features = parseJsonField(req.body.features, []);
  const fee_structure = parseJsonField(req.body.fee_structure, {});
  const slug = req.body.slug?.trim() || `${slugify(title)}-${Date.now().toString(36)}`;
  const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;

  const result = await db.query(
    `INSERT INTO courses (title, slug, description, class_level, subjects, fee_structure, eligibility, duration, image_url, features, is_featured, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      title, slug, description, class_level,
      JSON.stringify(subjects || []),
      JSON.stringify(fee_structure || {}),
      eligibility, duration, image_url,
      JSON.stringify(features || []),
      is_featured || false,
      is_active !== false,
      parseInt(sort_order, 10) || 0,
    ]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateCourse = asyncHandler(async (req, res) => {
  const updates = [];
  const params = [];
  let i = 1;

  ['title', 'slug', 'description', 'class_level', 'eligibility', 'duration', 'is_featured', 'is_active', 'sort_order'].forEach((f) => {
    if (req.body[f] !== undefined) { updates.push(`${f} = $${i++}`); params.push(req.body[f]); }
  });
  if (req.body.subjects !== undefined) {
    updates.push(`subjects = $${i++}`);
    params.push(JSON.stringify(parseJsonField(req.body.subjects, [])));
  }
  if (req.body.features !== undefined) {
    updates.push(`features = $${i++}`);
    params.push(JSON.stringify(parseJsonField(req.body.features, [])));
  }
  if (req.body.fee_structure !== undefined) {
    updates.push(`fee_structure = $${i++}`);
    params.push(JSON.stringify(parseJsonField(req.body.fee_structure, {})));
  }
  if (req.file) { updates.push(`image_url = $${i++}`); params.push(`/uploads/${req.file.filename}`); }
  else if (req.body.image_url !== undefined) { updates.push(`image_url = $${i++}`); params.push(req.body.image_url); }

  if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update' });

  params.push(req.params.id);
  const result = await db.query(
    `UPDATE courses SET ${updates.join(', ')} WHERE id = $${i} AND ${notDeleted} RETURNING *`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.deleteCourse = asyncHandler(async (req, res) => {
  await db.query('UPDATE courses SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Course deleted' });
});
