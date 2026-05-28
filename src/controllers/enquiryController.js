const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { sendEmail } = require('../services/emailService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const config = require('../config');

exports.enquiryValidation = [
  body('student_name').trim().notEmpty().isLength({ max: 150 }),
  body('parent_name').trim().notEmpty().isLength({ max: 150 }),
  body('mobile').trim().notEmpty().matches(/^[\d+\-\s()]{10,20}$/),
  body('email').isEmail().normalizeEmail(),
  body('class_interested').trim().notEmpty(),
  body('address').optional().trim(),
  body('message').optional().trim().isLength({ max: 2000 }),
  body('website').optional().isEmpty().withMessage('Spam detected'),
];

exports.createEnquiry = asyncHandler(async (req, res) => {
  const { student_name, parent_name, mobile, email, class_interested, address, message } = req.body;
  const ip = req.ip;

  const recent = await db.query(
    `SELECT id FROM enquiries WHERE mobile = $1 AND created_at > NOW() - INTERVAL '5 minutes' AND deleted_at IS NULL`,
    [mobile]
  );
  if (recent.rows.length) {
    return res.status(429).json({ success: false, message: 'Please wait before submitting again' });
  }

  const result = await db.query(
    `INSERT INTO enquiries (student_name, parent_name, mobile, email, class_interested, address, message, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [student_name, parent_name, mobile, email, class_interested, address, message, ip]
  );

  const enquiry = result.rows[0];
  const adminEmail = config.email.user || 'admin@smartschool.edu';

  res.status(201).json({ success: true, message: 'Enquiry submitted successfully', data: { id: enquiry.id } });

  setImmediate(async () => {
    try {
      await sendEmail({
        to: adminEmail,
        subject: `New Admission Enquiry - ${student_name}`,
        html: `<h2>New Enquiry</h2><p><strong>Student:</strong> ${student_name}</p><p><strong>Parent:</strong> ${parent_name}</p><p><strong>Class:</strong> ${class_interested}</p><p><strong>Mobile:</strong> ${mobile}</p><p><strong>Email:</strong> ${email}</p><p>${message || ''}</p>`,
      });
    } catch (e) {
      console.error('Email notification failed:', e.message);
    }

    try {
      const settings = await db.query("SELECT value FROM settings WHERE key = 'school_info'");
      const whatsapp = settings.rows[0]?.value?.whatsapp;
      if (whatsapp) {
        await sendWhatsAppMessage(whatsapp, `New enquiry: ${student_name} (${class_interested}) - ${mobile}`);
      }
    } catch (e) {
      console.error('WhatsApp notification failed:', e.message);
    }
  });
});

exports.getEnquiries = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  let where = 'WHERE deleted_at IS NULL';
  const params = [];
  if (status) { where += ' AND status = $1'; params.push(status); }
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM enquiries ${where}`, params);
  params.push(limit, offset);
  const i = params.length - 1;
  const result = await db.query(
    `SELECT * FROM enquiries ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.updateEnquiry = asyncHandler(async (req, res) => {
  const { status, admin_notes, is_spam } = req.body;
  const result = await db.query(
    `UPDATE enquiries SET status = COALESCE($1, status), admin_notes = COALESCE($2, admin_notes), is_spam = COALESCE($3, is_spam)
     WHERE id = $4 RETURNING *`,
    [status, admin_notes, is_spam, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.exportEnquiries = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT student_name, parent_name, mobile, email, class_interested, address, message, status, created_at
     FROM enquiries WHERE deleted_at IS NULL ORDER BY created_at DESC`
  );
  const headers = Object.keys(result.rows[0] || {});
  const csv = [headers.join(','), ...result.rows.map((r) => headers.map((h) => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=enquiries.csv');
  res.send(csv);
});
