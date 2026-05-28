const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const config = require('../config');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { dispatchAlert, sendFeeDueReminders, notifyResultsPublished } = require('../services/alertService');
const { createRazorpayOrder, completePayment, razorpayConfigured } = require('../services/paymentService');
const { ensurePortalAccounts } = require('../utils/portalAccounts');
const { logErp } = require('../utils/erpAudit');

const tokenTeacher = (account) =>
  jwt.sign({ type: 'teacher', accountId: account.id, facultyId: account.faculty_id }, config.jwt.secret, { expiresIn: '7d' });

// ─── ERP Analytics ────────────────────────────────────────────
exports.getErpAnalytics = asyncHandler(async (_req, res) => {
  const [students, fees, attendance, payroll, enquiries] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM students WHERE deleted_at IS NULL AND status = 'active'`),
    db.query(`SELECT
      COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending,
      COALESCE(SUM(CASE WHEN status='paid' THEN COALESCE(paid_amount,amount) ELSE 0 END),0) AS collected,
      COUNT(*) FILTER (WHERE status='pending')::int AS pending_count
      FROM fee_invoices`),
    db.query(`SELECT status, COUNT(*)::int AS count FROM attendance_records
      WHERE attendance_date >= CURRENT_DATE - INTERVAL '30 days' GROUP BY status`),
    db.query(`SELECT COUNT(*)::int AS staff FROM payroll_staff WHERE is_active = TRUE`),
    db.query(`SELECT COUNT(*)::int AS open FROM enquiries WHERE deleted_at IS NULL AND status NOT IN ('enrolled','closed')`),
  ]);
  const attMap = {};
  attendance.rows.forEach((r) => { attMap[r.status] = r.count; });
  const attTotal = Object.values(attMap).reduce((a, b) => a + b, 0);
  res.json({
    success: true,
    data: {
      active_students: students.rows[0].total,
      fee_pending: Number(fees.rows[0].pending),
      fee_collected: Number(fees.rows[0].collected),
      fee_pending_count: fees.rows[0].pending_count,
      attendance_30d: attMap,
      attendance_rate: attTotal ? Math.round(((attMap.present || 0) / attTotal) * 100) : null,
      payroll_staff: payroll.rows[0].staff,
      open_enquiries: enquiries.rows[0].open,
    },
  });
});

// ─── Portal account management ────────────────────────────────
exports.getPortalAccounts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  const { search } = req.query;
  let where = 'WHERE s.deleted_at IS NULL';
  const params = [];
  let i = 1;
  if (search) {
    where += ` AND (pa.username ILIKE $${i} OR s.student_name ILIKE $${i} OR s.admission_no ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  const count = await db.query(
    `SELECT COUNT(*)::int AS total FROM portal_accounts pa JOIN students s ON s.id = pa.student_id ${where}`,
    params
  );
  params.push(limit, offset);
  const result = await db.query(
    `SELECT pa.*, s.student_name, s.admission_no, s.class_level FROM portal_accounts pa
     JOIN students s ON s.id = pa.student_id ${where}
     ORDER BY s.student_name, pa.account_type LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.resetPortalPassword = asyncHandler(async (req, res) => {
  const account = await db.query(
    `SELECT pa.*, s.admission_no FROM portal_accounts pa JOIN students s ON s.id = pa.student_id WHERE pa.id = $1`,
    [req.params.id]
  );
  if (!account.rows.length) return res.status(404).json({ success: false, message: 'Account not found' });
  const newPass = req.body.password || String(account.rows[0].admission_no).slice(-4).padStart(4, '0');
  const hash = await bcrypt.hash(newPass, 10);
  await db.query('UPDATE portal_accounts SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
  await logErp(req, 'reset_portal_password', 'portal_account', req.params.id);
  res.json({ success: true, message: 'Password reset', data: { default_password: req.body.password ? undefined : newPass } });
});

exports.togglePortalAccount = asyncHandler(async (req, res) => {
  const result = await db.query(
    'UPDATE portal_accounts SET is_active = COALESCE($1, NOT is_active) WHERE id = $2 RETURNING *',
    [req.body.is_active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Account not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.provisionStudentPortal = asyncHandler(async (req, res) => {
  const student = await db.query(
    'SELECT id, admission_no, student_name FROM students WHERE id = $1 AND deleted_at IS NULL',
    [req.params.studentId]
  );
  if (!student.rows.length) return res.status(404).json({ success: false, message: 'Student not found' });
  await ensurePortalAccounts(student.rows[0].id, student.rows[0].admission_no);
  const accounts = await db.query(
    `SELECT pa.*, s.student_name, s.admission_no FROM portal_accounts pa
     JOIN students s ON s.id = pa.student_id WHERE pa.student_id = $1 ORDER BY pa.account_type`,
    [student.rows[0].id]
  );
  const defaultPass = String(student.rows[0].admission_no).slice(-4).padStart(4, '0');
  res.json({
    success: true,
    message: `Portal accounts ready for ${student.rows[0].student_name}`,
    data: {
      accounts: accounts.rows,
      student_username: student.rows[0].admission_no,
      parent_username: `${student.rows[0].admission_no}_parent`,
      default_password: defaultPass,
    },
  });
});

// ─── Payments (Razorpay) ──────────────────────────────────────
exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const inv = await db.query(
    `SELECT fi.*, s.id AS sid FROM fee_invoices fi JOIN students s ON s.id = fi.student_id WHERE fi.id = $1 AND fi.status = 'pending'`,
    [req.params.invoiceId]
  );
  if (!inv.rows.length) return res.status(404).json({ success: false, message: 'Pending invoice not found' });
  const row = inv.rows[0];
  const order = await createRazorpayOrder({ invoiceId: row.id, studentId: row.sid, amount: row.amount });
  res.json({ success: true, data: { ...order, invoice_id: row.id, razorpay_enabled: razorpayConfigured() } });
});

exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const order = await completePayment({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });
  res.json({ success: true, data: order, message: 'Payment verified' });
});

// ─── Academic years ───────────────────────────────────────────
exports.getAcademicYears = asyncHandler(async (_req, res) => {
  const result = await db.query('SELECT * FROM academic_years ORDER BY start_date DESC NULLS LAST');
  res.json({ success: true, data: result.rows });
});

exports.createAcademicYear = asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.is_current) await db.query('UPDATE academic_years SET is_current = FALSE');
  const result = await db.query(
    `INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.name, b.start_date, b.end_date, b.is_current || false]
  );
  await logErp(req, 'create_academic_year', 'academic_year', result.rows[0].id, { name: b.name });
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateAcademicYear = asyncHandler(async (req, res) => {
  const b = req.body;
  if (b.is_current) await db.query('UPDATE academic_years SET is_current = FALSE');
  const result = await db.query(
    `UPDATE academic_years SET name=COALESCE($1,name), start_date=$2, end_date=$3, is_current=COALESCE($4,is_current)
     WHERE id=$5 RETURNING *`,
    [b.name, b.start_date, b.end_date, b.is_current, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  await logErp(req, 'update_academic_year', 'academic_year', req.params.id);
  res.json({ success: true, data: result.rows[0] });
});

exports.deleteAcademicYear = asyncHandler(async (req, res) => {
  const row = await db.query('SELECT * FROM academic_years WHERE id = $1', [req.params.id]);
  if (!row.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  if (row.rows[0].is_current) {
    return res.status(400).json({ success: false, message: 'Cannot delete the current academic year' });
  }
  await db.query('DELETE FROM academic_years WHERE id = $1', [req.params.id]);
  await logErp(req, 'delete_academic_year', 'academic_year', req.params.id);
  res.json({ success: true, message: 'Deleted' });
});

exports.setCurrentAcademicYear = asyncHandler(async (req, res) => {
  await db.query('UPDATE academic_years SET is_current = FALSE');
  const result = await db.query('UPDATE academic_years SET is_current = TRUE WHERE id = $1 RETURNING *', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  await logErp(req, 'set_current_academic_year', 'academic_year', req.params.id);
  res.json({ success: true, data: result.rows[0] });
});

// ─── Exam publish + fee reminders ─────────────────────────────
exports.publishExamResults = asyncHandler(async (req, res) => {
  const exam = await db.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
  if (!exam.rows.length) return res.status(404).json({ success: false, message: 'Exam not found' });
  await db.query('UPDATE exams SET results_published = TRUE WHERE id = $1', [req.params.id]);
  await notifyResultsPublished(exam.rows[0]);
  await logErp(req, 'publish_exam_results', 'exam', req.params.id, { name: exam.rows[0].name });
  res.json({ success: true, message: 'Results published and parents notified' });
});

exports.sendFeeReminders = asyncHandler(async (req, res) => {
  const result = await sendFeeDueReminders();
  await logErp(req, 'send_fee_reminders', 'fee_invoice', null, result);
  res.json({ success: true, data: result });
});

// ─── Enquiry enroll ───────────────────────────────────────────
exports.enrollFromEnquiry = asyncHandler(async (req, res) => {
  const enq = await db.query('SELECT * FROM enquiries WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!enq.rows.length) return res.status(404).json({ success: false, message: 'Enquiry not found' });
  const e = enq.rows[0];
  if (e.student_id) return res.status(400).json({ success: false, message: 'Already enrolled', data: { student_id: e.student_id } });

  const year = new Date().getFullYear();
  const prefix = `STS-${year}-`;
  const last = await db.query(
    `SELECT admission_no FROM students WHERE admission_no LIKE $1 ORDER BY admission_no DESC LIMIT 1`, [`${prefix}%`]
  );
  const seq = last.rows[0] ? parseInt(last.rows[0].admission_no.split('-').pop(), 10) + 1 : 1;
  const admissionNo = `${prefix}${String(seq).padStart(4, '0')}`;

  const student = await db.query(
    `INSERT INTO students (admission_no, student_name, class_level, parent_name, parent_phone, parent_email, address, status, academic_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active','2026-27') RETURNING *`,
    [admissionNo, e.student_name, e.class_interested, e.parent_name, e.mobile, e.email, e.address]
  );
  await ensurePortalAccounts(student.rows[0].id, admissionNo);
  await db.query(
    `UPDATE enquiries SET status = 'enrolled', student_id = $1, enrolled_at = NOW() WHERE id = $2`,
    [student.rows[0].id, req.params.id]
  );
  res.json({ success: true, data: student.rows[0], message: `Enrolled as ${admissionNo}` });
});

// ─── Teacher portal ───────────────────────────────────────────
exports.provisionTeacherAccounts = asyncHandler(async (_req, res) => {
  const faculty = await db.query(`SELECT id, name, email FROM faculty WHERE deleted_at IS NULL AND is_active = TRUE`);
  let created = 0;
  for (const f of faculty.rows) {
    const username = (f.email || `${f.name.replace(/\s+/g, '.').toLowerCase()}@teacher.local`).toLowerCase();
    const hash = await bcrypt.hash('teacher123', 10);
    const r = await db.query(
      `INSERT INTO teacher_accounts (faculty_id, username, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [f.id, username, hash]
    );
    if (r.rows.length) created++;
  }
  res.json({ success: true, message: `Provisioned ${created} teacher accounts (default password: teacher123)` });
});

exports.getTeacherAccounts = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  const { search } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  let i = 1;
  if (search) {
    where += ` AND (ta.username ILIKE $${i} OR f.name ILIKE $${i} OR f.department ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  const count = await db.query(
    `SELECT COUNT(*)::int AS total FROM teacher_accounts ta LEFT JOIN faculty f ON f.id = ta.faculty_id ${where}`,
    params
  );
  params.push(limit, offset);
  const result = await db.query(
    `SELECT ta.*, f.name AS faculty_name, f.department, f.email AS faculty_email FROM teacher_accounts ta
     LEFT JOIN faculty f ON f.id = ta.faculty_id ${where}
     ORDER BY f.name NULLS LAST, ta.username LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.createTeacherAccount = asyncHandler(async (req, res) => {
  const { faculty_id, username, password } = req.body;
  if (!faculty_id) return res.status(400).json({ success: false, message: 'faculty_id required' });
  const faculty = await db.query('SELECT id, name, email FROM faculty WHERE id = $1 AND deleted_at IS NULL', [faculty_id]);
  if (!faculty.rows.length) return res.status(404).json({ success: false, message: 'Faculty not found' });
  const f = faculty.rows[0];
  const user = (username || f.email || `${f.name.replace(/\s+/g, '.').toLowerCase()}@teacher.local`).toLowerCase();
  const pass = password || 'teacher123';
  const hash = await bcrypt.hash(pass, 10);
  const result = await db.query(
    `INSERT INTO teacher_accounts (faculty_id, username, password_hash) VALUES ($1,$2,$3)
     ON CONFLICT (username) DO UPDATE SET faculty_id = EXCLUDED.faculty_id, password_hash = EXCLUDED.password_hash, is_active = TRUE
     RETURNING *`,
    [f.id, user, hash]
  );
  res.status(201).json({
    success: true,
    data: { ...result.rows[0], faculty_name: f.name, default_password: password ? undefined : pass },
    message: `Teacher account created: ${user}`,
  });
});

exports.resetTeacherPassword = asyncHandler(async (req, res) => {
  const account = await db.query('SELECT * FROM teacher_accounts WHERE id = $1', [req.params.id]);
  if (!account.rows.length) return res.status(404).json({ success: false, message: 'Account not found' });
  const newPass = req.body.password || 'teacher123';
  const hash = await bcrypt.hash(newPass, 10);
  await db.query('UPDATE teacher_accounts SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
  res.json({
    success: true,
    message: 'Password reset',
    data: { username: account.rows[0].username, default_password: req.body.password ? undefined : newPass },
  });
});

exports.toggleTeacherAccount = asyncHandler(async (req, res) => {
  const result = await db.query(
    'UPDATE teacher_accounts SET is_active = COALESCE($1, NOT is_active) WHERE id = $2 RETURNING *',
    [req.body.is_active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Account not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.teacherLoginValidation = [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
];

exports.teacherLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const result = await db.query(
    `SELECT ta.*, f.name AS faculty_name, f.department FROM teacher_accounts ta
     LEFT JOIN faculty f ON f.id = ta.faculty_id WHERE ta.username = $1 AND ta.is_active = TRUE`,
    [username.toLowerCase()]
  );
  const account = result.rows[0];
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  await db.query('UPDATE teacher_accounts SET last_login = NOW() WHERE id = $1', [account.id]);
  res.json({
    success: true,
    data: {
      token: tokenTeacher(account),
      account: { name: account.faculty_name, username: account.username, department: account.department },
    },
  });
});

exports.getTeacherDashboard = asyncHandler(async (req, res) => {
  const teacherName = req.teacher?.faculty_name;
  const slots = teacherName
    ? await db.query(
      `SELECT * FROM timetable_slots WHERE teacher_name ILIKE $1 AND is_active = TRUE ORDER BY day_of_week, period_number`,
      [`%${teacherName}%`]
    )
    : { rows: [] };
  const homework = await db.query(
    `SELECT * FROM homework_assignments WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`
  );
  res.json({
    success: true,
    data: { timetable: slots.rows, homework: homework.rows, teacher: req.teacher },
  });
});

exports.enhancedSendAlert = asyncHandler(async (req, res) => {
  const { recipient, message, channel } = req.body;
  const status = await dispatchAlert({ recipient, message, channel: channel || 'whatsapp' });
  res.json({ success: true, data: { status } });
});
