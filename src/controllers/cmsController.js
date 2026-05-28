const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { getCachedSettings, invalidateSettingsCache } = require('../utils/settingsCache');
const slugify = require('../utils/slugify');
const { sendEmail } = require('../services/emailService');
const { logActivity } = require('../utils/activityLog');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { razorpayConfigured } = require('../services/paymentService');

const notDeleted = 'deleted_at IS NULL';

exports.getAnnouncements = asyncHandler(async (req, res) => {
  let query = `SELECT * FROM announcements WHERE ${notDeleted}`;
  if (req.query.all !== 'true') {
    query += ` AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())`;
  }
  const limit = req.query.all === 'true' ? 500 : 50;
  query += ` ORDER BY is_pinned DESC, published_at DESC LIMIT ${limit}`;
  const result = await db.query(query);
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=30');
  res.json({ success: true, data: result.rows });
});

exports.createAnnouncement = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO announcements (title, content, type, is_pinned, is_active, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.title, b.content, b.type || 'general', b.is_pinned || false, b.is_active ?? true, b.expires_at]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateAnnouncement = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE announcements SET title=$1, content=$2, type=$3, is_pinned=$4, is_active=$5, expires_at=$6
     WHERE id=$7 AND ${notDeleted} RETURNING *`,
    [b.title, b.content, b.type, b.is_pinned, b.is_active, b.expires_at, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.getEvents = asyncHandler(async (req, res) => {
  let query = `SELECT id, title, slug, description, location, event_date, end_date, image_url, is_featured, sort_order
    FROM events WHERE ${notDeleted}`;
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  query += ' ORDER BY sort_order ASC, event_date ASC';
  const limit = req.query.all === 'true' ? 200 : 50;
  query += ` LIMIT ${limit}`;
  const result = await db.query(query);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows });
});

exports.getEvent = asyncHandler(async (req, res) => {
  let query = `SELECT * FROM events WHERE (slug = $1 OR id::text = $1) AND ${notDeleted}`;
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  const result = await db.query(query, [req.params.slug]);
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Event not found' });
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows[0] });
});

function parseJsonField(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

exports.createEvent = asyncHandler(async (req, res) => {
  const b = req.body;
  const slug = b.slug?.trim() || `${slugify(b.title)}-${Date.now().toString(36)}`;
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const highlights = parseJsonField(b.highlights, []);
  const result = await db.query(
    `INSERT INTO events (title, slug, description, details, highlights, location, event_date, end_date, image_url, is_featured, is_active, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      b.title, slug, b.description, b.details, JSON.stringify(highlights),
      b.location, b.event_date, b.end_date || null, image_url,
      b.is_featured || false, b.is_active !== false,
      parseInt(b.sort_order, 10) || 0,
    ]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateEvent = asyncHandler(async (req, res) => {
  const b = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const highlights = b.highlights !== undefined ? parseJsonField(b.highlights, []) : undefined;
  const result = await db.query(
    `UPDATE events SET title=$1, slug=$2, description=$3, details=$4, highlights=COALESCE($5, highlights),
     location=$6, event_date=$7, end_date=$8, image_url=COALESCE($9, image_url), is_featured=$10, is_active=$11, sort_order=$12
     WHERE id=$13 AND ${notDeleted} RETURNING *`,
    [
      b.title, b.slug, b.description, b.details,
      highlights ? JSON.stringify(highlights) : null,
      b.location, b.event_date, b.end_date || null, image_url,
      b.is_featured, b.is_active !== false,
      parseInt(b.sort_order, 10) || 0, req.params.id,
    ]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.getTestimonials = asyncHandler(async (req, res) => {
  let query = `SELECT * FROM testimonials WHERE ${notDeleted}`;
  if (req.query.all !== 'true') query += ' AND is_active = TRUE';
  const limit = req.query.all === 'true' ? 500 : 50;
  query += ` ORDER BY is_featured DESC, created_at DESC LIMIT ${limit}`;
  const result = await db.query(query);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows });
});

exports.createTestimonial = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO testimonials (name, role, content, rating, image_url, is_featured)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.name, b.role, b.content, b.rating || 5, b.image_url, b.is_featured || false]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateTestimonial = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE testimonials SET name=$1, role=$2, content=$3, rating=$4, image_url=$5, is_featured=$6, is_active=$7
     WHERE id=$8 AND ${notDeleted} RETURNING *`,
    [b.name, b.role, b.content, b.rating, b.image_url, b.is_featured, b.is_active ?? true, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.getAchievements = asyncHandler(async (req, res) => {
  const { category, year, featured, limit, entry_type, students_only } = req.query;
  let query = `SELECT id, title, description, category, student_name, rank, rank_order, year, image_url, is_featured, entry_type
    FROM achievements WHERE ${notDeleted}`;
  const params = [];
  let i = 1;
  if (category) { query += ` AND category = $${i++}`; params.push(category); }
  if (year) { query += ` AND year = $${i++}`; params.push(parseInt(year, 10)); }
  if (featured === 'true') query += ' AND is_featured = TRUE';
  if (entry_type) { query += ` AND entry_type = $${i++}`; params.push(entry_type); }
  if (students_only === 'true') query += " AND student_name IS NOT NULL AND student_name <> ''";

  const isTopperQuery = entry_type === 'topper' || students_only === 'true';
  query += isTopperQuery
    ? ' ORDER BY year DESC, rank_order ASC NULLS LAST, created_at ASC'
    : ' ORDER BY year DESC, created_at DESC';

  const defaultLimit = req.query.all === 'true' ? 200 : 50;
  const safeLimit = Math.min(parseInt(limit, 10) || defaultLimit, 200);
  query += ` LIMIT $${i++}`;
  params.push(safeLimit);
  const result = await db.query(query, params);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: result.rows });
});

exports.createAchievement = asyncHandler(async (req, res) => {
  const b = req.body;
  const entryType = b.entry_type || (b.student_name ? 'topper' : 'award');
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const result = await db.query(
    `INSERT INTO achievements (title, description, category, student_name, rank, rank_order, entry_type, year, image_url, stats, is_featured)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      b.title, b.description, b.category, b.student_name, b.rank,
      parseInt(b.rank_order, 10) || 0, entryType, b.year, image_url,
      JSON.stringify(b.stats || {}), b.is_featured || false,
    ]
  );
  if (req.user) await logActivity({ userId: req.user.id, action: 'create', entityType: 'achievement', entityId: result.rows[0].id, ip: req.ip });
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateAchievement = asyncHandler(async (req, res) => {
  const b = req.body;
  const entryType = b.entry_type || (b.student_name ? 'topper' : 'award');
  const image_url = req.file ? `/uploads/${req.file.filename}` : b.image_url;
  const result = await db.query(
    `UPDATE achievements SET title=$1, description=$2, category=$3, student_name=$4, rank=$5, rank_order=$6,
     entry_type=$7, year=$8, image_url=COALESCE($9, image_url), stats=$10, is_featured=$11 WHERE id=$12 AND ${notDeleted} RETURNING *`,
    [
      b.title, b.description, b.category, b.student_name, b.rank,
      parseInt(b.rank_order, 10) || 0, entryType, b.year, image_url || null,
      JSON.stringify(b.stats || {}), b.is_featured, req.params.id,
    ]
  );
  if (req.user) await logActivity({ userId: req.user.id, action: 'update', entityType: 'achievement', entityId: req.params.id, ip: req.ip });
  res.json({ success: true, data: result.rows[0] });
});

exports.contactValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').optional({ checkFalsy: true }).trim(),
  body('subject').optional({ checkFalsy: true }).trim(),
  body('message').trim().notEmpty().withMessage('Message is required'),
];

exports.newsletterValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
];

exports.createContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  await db.query(
    `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5)`,
    [name, email, phone, subject, message]
  );
  res.status(201).json({ success: true, message: 'Message sent successfully' });

  setImmediate(async () => {
    try {
      const settings = await getCachedSettings(db);
      const adminEmail = settings.school_info?.email || config.email.user || 'admin@smartschool.edu';
      await sendEmail({
        to: adminEmail,
        subject: `New Contact Message${subject ? `: ${subject}` : ''}`,
        html: `<h2>Contact Form</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || '—'}</p><p><strong>Subject:</strong> ${subject || '—'}</p><p>${message}</p>`,
      });
    } catch (e) {
      console.error('Contact email failed:', e.message);
    }
  });
});

exports.getContacts = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 200 });
  const conditions = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR subject ILIKE $${params.length})`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM contact_messages ${where}`, params);
  params.push(limit, offset);
  const i = params.length - 1;
  const result = await db.query(
    `SELECT * FROM contact_messages ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.exportContacts = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT name, email, phone, subject, message, is_read, created_at
     FROM contact_messages ORDER BY created_at DESC`
  );
  const headers = Object.keys(result.rows[0] || { name: '', email: '', phone: '', subject: '', message: '', is_read: '', created_at: '' });
  const csv = [
    headers.join(','),
    ...result.rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=contact-messages.csv');
  res.send(csv);
});

exports.getIntegrations = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      whatsapp: !!(config.whatsapp?.token && config.whatsapp?.phoneNumberId),
      sms: !!(process.env.TWILIO_ACCOUNT_SID || process.env.MSG91_AUTH_KEY),
      razorpay: razorpayConfigured(),
      email: !!(config.email?.user),
    },
  });
});

exports.getNewsletterSubscribers = asyncHandler(async (_req, res) => {
  const result = await db.query(
    'SELECT id, email, is_active, created_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 500'
  );
  res.json({ success: true, data: result.rows });
});

exports.exportNewsletter = asyncHandler(async (_req, res) => {
  const result = await db.query(
    'SELECT email, is_active, created_at FROM newsletter_subscribers ORDER BY created_at DESC'
  );
  const headers = ['email', 'is_active', 'created_at'];
  const csv = [
    headers.join(','),
    ...result.rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=newsletter-subscribers.csv');
  res.send(csv);
});

exports.markContactRead = asyncHandler(async (req, res) => {
  const result = await db.query(
    'UPDATE contact_messages SET is_read = $1 WHERE id = $2 RETURNING *',
    [req.body.is_read ?? true, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.subscribeNewsletter = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await db.query(
    `INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET is_active = TRUE`,
    [email]
  );
  res.json({ success: true, message: 'Subscribed successfully' });
});

exports.unsubscribeNewsletter = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await db.query(
    'UPDATE newsletter_subscribers SET is_active = FALSE WHERE email = $1 RETURNING id',
    [email]
  );
  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Email not found in subscribers list' });
  }
  res.json({ success: true, message: 'Unsubscribed successfully' });
});

exports.patchNewsletterSubscriber = asyncHandler(async (req, res) => {
  const { is_active } = req.body;
  const result = await db.query(
    'UPDATE newsletter_subscribers SET is_active = $1 WHERE id = $2 RETURNING *',
    [is_active ?? false, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.getSettings = asyncHandler(async (_req, res) => {
  const settings = await getCachedSettings(db);
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.json({ success: true, data: settings });
});

exports.updateSetting = asyncHandler(async (req, res) => {
  const { value } = req.body;
  const result = await db.query(
    `UPDATE settings SET value = $1 WHERE key = $2 RETURNING *`,
    [JSON.stringify(value), req.params.key]
  );
  invalidateSettingsCache();
  res.json({ success: true, data: result.rows[0] });
});

exports.getDashboardAnalytics = asyncHandler(async (_req, res) => {
  const [enquiries, contacts, chats, subscribers, recentEnquiries, recentContacts, totalContacts, totalEnquiries, enquiriesByDay, contactsByDay, chatsByDay] = await Promise.all([
    db.query("SELECT COUNT(*) FROM enquiries WHERE deleted_at IS NULL AND status = 'new'"),
    db.query('SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE'),
    db.query("SELECT COUNT(*) FROM chatbot_logs WHERE created_at >= CURRENT_DATE"),
    db.query('SELECT COUNT(*) FROM newsletter_subscribers WHERE is_active = TRUE'),
    db.query("SELECT * FROM enquiries WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5"),
    db.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 5'),
    db.query('SELECT COUNT(*) FROM contact_messages'),
    db.query('SELECT COUNT(*) FROM enquiries WHERE deleted_at IS NULL'),
    db.query(`SELECT DATE(created_at) as date, COUNT(*)::int as count FROM enquiries
      WHERE deleted_at IS NULL AND created_at >= CURRENT_DATE - INTERVAL '13 days'
      GROUP BY DATE(created_at) ORDER BY date ASC`),
    db.query(`SELECT DATE(created_at) as date, COUNT(*)::int as count FROM contact_messages
      WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
      GROUP BY DATE(created_at) ORDER BY date ASC`),
    db.query(`SELECT DATE(created_at) as date, COUNT(*)::int as count FROM chatbot_logs
      WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
      GROUP BY DATE(created_at) ORDER BY date ASC`),
  ]);

  res.json({
    success: true,
    data: {
      new_enquiries: parseInt(enquiries.rows[0].count, 10),
      unread_contacts: parseInt(contacts.rows[0].count, 10),
      chats_today: parseInt(chats.rows[0].count, 10),
      subscribers: parseInt(subscribers.rows[0].count, 10),
      total_contacts: parseInt(totalContacts.rows[0].count, 10),
      total_enquiries: parseInt(totalEnquiries.rows[0].count, 10),
      recent_enquiries: recentEnquiries.rows,
      recent_contacts: recentContacts.rows,
      enquiries_by_day: enquiriesByDay.rows,
      contacts_by_day: contactsByDay.rows,
      chats_by_day: chatsByDay.rows,
    },
  });
});

exports.getActivityLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const result = await db.query(
    `SELECT a.*, u.name as user_name, u.email as user_email
     FROM activity_logs a LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ success: true, data: result.rows });
});

exports.getSitemapUrls = asyncHandler(async (_req, res) => {
  const [courses, events] = await Promise.all([
    db.query(`SELECT slug, updated_at FROM courses WHERE deleted_at IS NULL AND is_active = TRUE`),
    db.query(`SELECT slug, updated_at FROM events WHERE deleted_at IS NULL AND is_active = TRUE`),
  ]);
  res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
  res.json({
    success: true,
    data: {
      courses: courses.rows,
      events: events.rows,
    },
  });
});

exports.deleteRecord = asyncHandler(async (req, res) => {
  const allowed = ['announcements', 'events', 'testimonials', 'achievements'];
  const table = req.params.table;
  if (!allowed.includes(table)) return res.status(400).json({ success: false, message: 'Invalid table' });
  await db.query(`UPDATE ${table} SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
  if (req.user) await logActivity({ userId: req.user.id, action: 'delete', entityType: table, entityId: req.params.id, ip: req.ip });
  res.json({ success: true, message: 'Deleted' });
});
