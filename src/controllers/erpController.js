const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const config = require('../config');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { notifyHomeworkPublished } = require('../services/alertService');
const { dispatchAlert } = require('../services/alertService');
const { ensurePortalAccounts } = require('../utils/portalAccounts');
const { logErp } = require('../utils/erpAudit');

const adminOnly = ['admin', 'super_admin'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveStudentId(value) {
  if (!value) return null;
  const v = String(value).trim();
  const query = UUID_RE.test(v)
    ? 'SELECT id FROM students WHERE id = $1 AND deleted_at IS NULL'
    : 'SELECT id FROM students WHERE admission_no = $1 AND deleted_at IS NULL';
  const result = await db.query(query, [v]);
  return result.rows[0]?.id || null;
}

const tokenPortal = (account) =>
  jwt.sign(
    { type: 'portal', accountId: account.id, studentId: account.student_id, accountType: account.account_type },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

async function ensurePortalAccountsReexport(studentId, admissionNo) {
  return ensurePortalAccounts(studentId, admissionNo);
}
exports.ensurePortalAccounts = ensurePortalAccountsReexport;

const genericList = (table, order = 'created_at DESC', softDelete = false) =>
  asyncHandler(async (req, res) => {
    const where = softDelete ? 'WHERE deleted_at IS NULL' : '';
    const result = await db.query(`SELECT * FROM ${table} ${where} ORDER BY ${order} LIMIT 1000`);
    res.json({ success: true, data: result.rows });
  });

const genericDelete = (table, soft = false) =>
  asyncHandler(async (req, res) => {
    const q = soft
      ? `UPDATE ${table} SET deleted_at = NOW() WHERE id = $1 RETURNING id`
      : `DELETE FROM ${table} WHERE id = $1 RETURNING id`;
    const result = await db.query(q, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  });

// ─── Attendance ───────────────────────────────────────────────
exports.getAttendance = asyncHandler(async (req, res) => {
  const { date, class: cls, section } = req.query;
  let query = `SELECT ar.*, s.student_name, s.admission_no FROM attendance_records ar
    JOIN students s ON s.id = ar.student_id WHERE s.deleted_at IS NULL`;
  const params = [];
  let i = 1;
  if (date) { query += ` AND ar.attendance_date = $${i++}`; params.push(date); }
  if (cls) { query += ` AND ar.class_level = $${i++}`; params.push(cls); }
  if (section) { query += ` AND ar.section = $${i++}`; params.push(section); }
  query += ' ORDER BY s.student_name LIMIT 500';
  const result = await db.query(query, params);
  res.json({ success: true, data: result.rows });
});

exports.getAttendanceReport = asyncHandler(async (req, res) => {
  const { from, to, class: cls, section } = req.query;
  let query = `SELECT ar.*, s.student_name, s.admission_no, s.class_level, s.section AS student_section
    FROM attendance_records ar
    JOIN students s ON s.id = ar.student_id
    WHERE s.deleted_at IS NULL`;
  const params = [];
  let i = 1;
  if (from) { query += ` AND ar.attendance_date >= $${i++}`; params.push(from); }
  if (to) { query += ` AND ar.attendance_date <= $${i++}`; params.push(to); }
  if (cls) { query += ` AND ar.class_level = $${i++}`; params.push(cls); }
  if (section) { query += ` AND ar.section = $${i++}`; params.push(section); }
  query += ' ORDER BY ar.attendance_date DESC, s.student_name LIMIT 2000';
  const result = await db.query(query, params);
  const summary = {};
  result.rows.forEach((r) => {
    summary[r.status] = (summary[r.status] || 0) + 1;
  });
  res.json({ success: true, data: { records: result.rows, summary, total: result.rows.length } });
});

exports.markAttendanceBulk = asyncHandler(async (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records) || !records.length) {
    return res.status(400).json({ success: false, message: 'date and records required' });
  }
  const studentIds = records.map((r) => r.student_id);
  const statuses = records.map((r) => r.status || 'present');
  const classLevels = records.map((r) => r.class_level);
  const sections = records.map((r) => r.section);
  const markedBy = req.user?.id;

  await db.query(
    `INSERT INTO attendance_records (student_id, attendance_date, status, class_level, section, marked_by)
     SELECT * FROM UNNEST($1::uuid[], $2::date[], $3::text[], $4::text[], $5::text[], $6::uuid[])
     AS t(student_id, attendance_date, status, class_level, section, marked_by)
     ON CONFLICT (student_id, attendance_date) DO UPDATE SET
       status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
    [studentIds, studentIds.map(() => date), statuses, classLevels, sections, studentIds.map(() => markedBy)]
  );

  const absentIds = records.filter((r) => r.status === 'absent').map((r) => r.student_id);
  if (absentIds.length) {
    const absentStudents = await db.query(
      'SELECT id, student_name, parent_phone FROM students WHERE id = ANY($1::uuid[]) AND parent_phone IS NOT NULL',
      [absentIds]
    );
    for (const st of absentStudents.rows) {
      const msg = `Dear Parent, ${st.student_name} was marked absent on ${date}. - Smart School`;
      sendWhatsAppMessage(st.parent_phone, msg).catch(() => {});
      db.query(
        `INSERT INTO alert_logs (recipient, channel, message, status, sent_at) VALUES ($1,'whatsapp',$2,'sent',NOW())`,
        [st.parent_phone, msg]
      ).catch(() => {});
    }
  }
  await logErp(req, 'mark_attendance_bulk', 'attendance', date, { count: records.length });
  res.json({ success: true, data: { marked: records.length } });
});

// ─── Timetable ────────────────────────────────────────────────
exports.getTimetable = asyncHandler(async (req, res) => {
  const { class: cls, section } = req.query;
  let query = 'SELECT * FROM timetable_slots WHERE is_active = TRUE';
  const params = [];
  if (cls) { query += ' AND class_level = $1'; params.push(cls); }
  if (section) { query += ` AND section = $${params.length + 1}`; params.push(section); }
  query += ' ORDER BY day_of_week, period_number';
  const result = await db.query(query, params);
  res.json({ success: true, data: result.rows });
});

exports.createTimetable = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO timetable_slots (class_level, section, day_of_week, period_number, subject, teacher_name, start_time, end_time, room, academic_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [b.class_level, b.section || 'A', b.day_of_week, b.period_number, b.subject, b.teacher_name, b.start_time, b.end_time, b.room, b.academic_year || '2026-27']
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateTimetable = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE timetable_slots SET class_level=COALESCE($1,class_level), section=COALESCE($2,section), day_of_week=COALESCE($3,day_of_week),
     period_number=COALESCE($4,period_number), subject=COALESCE($5,subject), teacher_name=$6, start_time=$7, end_time=$8, room=$9, is_active=COALESCE($10,is_active)
     WHERE id=$11 RETURNING *`,
    [b.class_level, b.section, b.day_of_week, b.period_number, b.subject, b.teacher_name, b.start_time, b.end_time, b.room, b.is_active, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});

exports.deleteTimetable = genericDelete('timetable_slots');

// ─── Homework ─────────────────────────────────────────────────
exports.getHomework = genericList('homework_assignments', 'due_date DESC NULLS LAST, created_at DESC', true);
exports.createHomework = asyncHandler(async (req, res) => {
  const b = req.body;
  const attachments = b.attachments
    ? (typeof b.attachments === 'string' ? b.attachments : JSON.stringify(b.attachments))
    : (b.attachment_url ? JSON.stringify([{ url: b.attachment_url, name: b.attachment_name || 'Attachment' }]) : '[]');
  const result = await db.query(
    `INSERT INTO homework_assignments (title, description, class_level, section, subject, due_date, created_by, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
    [b.title, b.description, b.class_level, b.section, b.subject, b.due_date, req.user?.id, attachments]
  );
  notifyHomeworkPublished(result.rows[0]).catch(() => {});
  await logErp(req, 'create_homework', 'homework', result.rows[0].id, { title: b.title, class_level: b.class_level });
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateHomework = asyncHandler(async (req, res) => {
  const b = req.body;
  const attachments = b.attachments !== undefined
    ? (typeof b.attachments === 'string' ? b.attachments : JSON.stringify(b.attachments))
    : (b.attachment_url ? JSON.stringify([{ url: b.attachment_url, name: b.attachment_name || 'Attachment' }]) : null);
  const result = await db.query(
    `UPDATE homework_assignments SET title=COALESCE($1,title), description=$2, class_level=COALESCE($3,class_level),
     section=$4, subject=$5, due_date=$6, is_active=COALESCE($7,is_active),
     attachments=COALESCE($8::jsonb, attachments) WHERE id=$9 AND deleted_at IS NULL RETURNING *`,
    [b.title, b.description, b.class_level, b.section, b.subject, b.due_date, b.is_active, attachments, req.params.id]
  );
  if (result.rows.length) await logErp(req, 'update_homework', 'homework', req.params.id);
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteHomework = genericDelete('homework_assignments', true);

// ─── Exams ────────────────────────────────────────────────────
exports.getExamTerms = genericList('exam_terms', 'start_date DESC');
exports.createExamTerm = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO exam_terms (name, academic_year, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.name, b.academic_year || '2026-27', b.start_date, b.end_date]
  );
  await logErp(req, 'create_exam_term', 'exam_term', result.rows[0].id, { name: b.name });
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateExamTerm = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE exam_terms SET name=COALESCE($1,name), academic_year=COALESCE($2,academic_year), start_date=$3, end_date=$4
     WHERE id=$5 RETURNING *`,
    [b.name, b.academic_year, b.start_date, b.end_date, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  await logErp(req, 'update_exam_term', 'exam_term', req.params.id);
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteExamTerm = asyncHandler(async (req, res) => {
  const used = await db.query('SELECT COUNT(*)::int AS c FROM exams WHERE term_id = $1', [req.params.id]);
  if (used.rows[0].c > 0) {
    return res.status(400).json({ success: false, message: 'Cannot delete — term has linked exams' });
  }
  const result = await db.query('DELETE FROM exam_terms WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
  await logErp(req, 'delete_exam_term', 'exam_term', req.params.id);
  res.json({ success: true, message: 'Deleted' });
});

exports.getExams = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT e.*, t.name AS term_name FROM exams e LEFT JOIN exam_terms t ON t.id = e.term_id ORDER BY e.exam_date DESC`
  );
  res.json({ success: true, data: result.rows });
});
exports.createExam = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO exams (term_id, name, class_level, subject, exam_date, max_marks, pass_marks) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.term_id, b.name, b.class_level, b.subject, b.exam_date, b.max_marks || 100, b.pass_marks || 35]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateExam = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE exams SET term_id=COALESCE($1,term_id), name=COALESCE($2,name), class_level=COALESCE($3,class_level), subject=COALESCE($4,subject),
     exam_date=$5, max_marks=COALESCE($6,max_marks), pass_marks=COALESCE($7,pass_marks),
     results_published=COALESCE($8,results_published) WHERE id=$9 RETURNING *`,
    [b.term_id, b.name, b.class_level, b.subject, b.exam_date, b.max_marks, b.pass_marks, b.results_published, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Exam not found' });
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteExam = genericDelete('exams');

exports.getExamMarks = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT em.*, s.student_name, s.admission_no, e.name AS exam_name, e.max_marks
     FROM exam_marks em JOIN students s ON s.id = em.student_id JOIN exams e ON e.id = em.exam_id
     WHERE em.exam_id = $1 ORDER BY s.student_name`,
    [req.params.examId]
  );
  res.json({ success: true, data: result.rows });
});

exports.saveExamMarks = asyncHandler(async (req, res) => {
  const { marks } = req.body;
  if (!Array.isArray(marks)) return res.status(400).json({ success: false, message: 'marks array required' });
  for (const m of marks) {
    const grade = m.marks_obtained >= 90 ? 'A+' : m.marks_obtained >= 75 ? 'A' : m.marks_obtained >= 60 ? 'B' : m.marks_obtained >= 35 ? 'C' : 'F';
    await db.query(
      `INSERT INTO exam_marks (exam_id, student_id, marks_obtained, grade, remarks)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained, grade=EXCLUDED.grade, remarks=EXCLUDED.remarks`,
      [req.params.examId, m.student_id, m.marks_obtained, grade, m.remarks]
    );
  }
  res.json({ success: true, message: 'Marks saved' });
});

exports.getReportCard = asyncHandler(async (req, res) => {
  const { studentId, termId } = req.params;
  const result = await db.query(
    `SELECT e.subject, e.name AS exam_name, e.max_marks, em.marks_obtained, em.grade, t.name AS term_name
     FROM exam_marks em JOIN exams e ON e.id = em.exam_id LEFT JOIN exam_terms t ON t.id = e.term_id
     WHERE em.student_id = $1 ${termId ? 'AND e.term_id = $2' : ''} ORDER BY e.subject`,
    termId ? [studentId, termId] : [studentId]
  );
  const student = await db.query('SELECT * FROM students WHERE id = $1', [studentId]);
  res.json({ success: true, data: { student: student.rows[0], marks: result.rows } });
});

// ─── Fees ─────────────────────────────────────────────────────
exports.getFeeHeads = genericList('fee_heads', 'name ASC');
exports.createFeeHead = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO fee_heads (name, amount, class_level, frequency, academic_year) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.name, b.amount, b.class_level, b.frequency || 'annual', b.academic_year || '2026-27']
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateFeeHead = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE fee_heads SET name=COALESCE($1,name), amount=COALESCE($2,amount), class_level=$3, frequency=$4, is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *`,
    [b.name, b.amount, b.class_level, b.frequency, b.is_active, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteFeeHead = genericDelete('fee_heads');

exports.getFeeInvoices = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  const { status, search } = req.query;
  let where = 'WHERE s.deleted_at IS NULL';
  const params = [];
  let i = 1;
  if (status) { where += ` AND fi.status = $${i++}`; params.push(status); }
  if (search) {
    where += ` AND (s.student_name ILIKE $${i} OR s.admission_no ILIKE $${i} OR fi.title ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }
  const count = await db.query(
    `SELECT COUNT(*)::int AS total FROM fee_invoices fi JOIN students s ON s.id = fi.student_id ${where}`,
    params
  );
  params.push(limit, offset);
  const result = await db.query(
    `SELECT fi.*, s.student_name, s.admission_no, s.class_level, s.section, fh.name AS fee_head_name
     FROM fee_invoices fi
     JOIN students s ON s.id = fi.student_id
     LEFT JOIN fee_heads fh ON fh.id = fi.fee_head_id
     ${where} ORDER BY fi.due_date DESC NULLS LAST LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});
exports.createFeeInvoice = asyncHandler(async (req, res) => {
  const b = req.body;
  const studentId = await resolveStudentId(b.student_id);
  if (!studentId) return res.status(400).json({ success: false, message: 'Student not found. Select a student or use a valid admission number.' });
  const result = await db.query(
    `INSERT INTO fee_invoices (student_id, fee_head_id, title, amount, due_date, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [studentId, b.fee_head_id, b.title, b.amount, b.due_date, b.status || 'pending']
  );
  await logErp(req, 'create_fee_invoice', 'fee_invoice', result.rows[0].id, { student_id: studentId, amount: b.amount });
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.payFeeInvoice = asyncHandler(async (req, res) => {
  const { paid_amount, payment_mode, reference_no } = req.body;
  const result = await db.query(
    `UPDATE fee_invoices SET paid_amount = COALESCE($1, amount), paid_at = NOW(), payment_mode = $2, reference_no = $3,
     status = 'paid' WHERE id = $4 RETURNING *`,
    [paid_amount, payment_mode, reference_no, req.params.id]
  );
  if (result.rows.length) await logErp(req, 'pay_fee_invoice', 'fee_invoice', req.params.id, { payment_mode });
  res.json({ success: true, data: result.rows[0] });
});
exports.updateFeeInvoice = asyncHandler(async (req, res) => {
  const b = req.body;
  const existing = await db.query('SELECT * FROM fee_invoices WHERE id = $1', [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Invoice not found' });
  if (existing.rows[0].status === 'paid') {
    return res.status(400).json({ success: false, message: 'Paid invoices cannot be edited' });
  }
  let studentId = existing.rows[0].student_id;
  if (b.student_id) {
    studentId = await resolveStudentId(b.student_id);
    if (!studentId) return res.status(400).json({ success: false, message: 'Student not found' });
  }
  const result = await db.query(
    `UPDATE fee_invoices SET
      student_id = $1,
      fee_head_id = $2,
      title = COALESCE($3, title),
      amount = COALESCE($4, amount),
      due_date = $5,
      status = COALESCE($6, status),
      updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [
      studentId,
      b.fee_head_id !== undefined ? b.fee_head_id || null : existing.rows[0].fee_head_id,
      b.title,
      b.amount,
      b.due_date !== undefined ? b.due_date || null : existing.rows[0].due_date,
      b.status,
      req.params.id,
    ]
  );
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteFeeInvoice = asyncHandler(async (req, res) => {
  const existing = await db.query('SELECT status FROM fee_invoices WHERE id = $1', [req.params.id]);
  if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Invoice not found' });
  if (existing.rows[0].status === 'paid') {
    return res.status(400).json({ success: false, message: 'Paid invoices cannot be deleted' });
  }
  await db.query('DELETE FROM fee_invoices WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Invoice deleted' });
});

// ─── Transport ────────────────────────────────────────────────
exports.getTransportRoutes = asyncHandler(async (req, res) => {
  const routes = await db.query('SELECT * FROM transport_routes ORDER BY name');
  const stops = await db.query('SELECT * FROM transport_stops ORDER BY route_id, sort_order');
  res.json({ success: true, data: { routes: routes.rows, stops: stops.rows } });
});
exports.createTransportRoute = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO transport_routes (name, vehicle_no, driver_name, driver_phone, capacity) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [b.name, b.vehicle_no, b.driver_name, b.driver_phone, b.capacity || 40]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateTransportRoute = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE transport_routes SET name=COALESCE($1,name), vehicle_no=$2, driver_name=$3, driver_phone=$4, capacity=COALESCE($5,capacity) WHERE id=$6 RETURNING *`,
    [b.name, b.vehicle_no, b.driver_name, b.driver_phone, b.capacity, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Route not found' });
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteTransportRoute = genericDelete('transport_routes');
exports.createTransportStop = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO transport_stops (route_id, stop_name, pickup_time, sort_order) VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.route_id, b.stop_name, b.pickup_time, b.sort_order || 0]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateTransportStop = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE transport_stops SET route_id=COALESCE($1,route_id), stop_name=COALESCE($2,stop_name), pickup_time=$3, sort_order=COALESCE($4,sort_order) WHERE id=$5 RETURNING *`,
    [b.route_id, b.stop_name, b.pickup_time, b.sort_order, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Stop not found' });
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteTransportStop = genericDelete('transport_stops');
exports.assignTransport = asyncHandler(async (req, res) => {
  const b = req.body;
  const studentId = await resolveStudentId(b.student_id);
  if (!studentId) return res.status(400).json({ success: false, message: 'Student not found. Select a student or use a valid admission number.' });
  const result = await db.query(
    `INSERT INTO student_transport (student_id, route_id, stop_id, academic_year) VALUES ($1,$2,$3,$4)
     ON CONFLICT (student_id, academic_year) DO UPDATE SET route_id=EXCLUDED.route_id, stop_id=EXCLUDED.stop_id RETURNING *`,
    [studentId, b.route_id, b.stop_id, b.academic_year || '2026-27']
  );
  res.json({ success: true, data: result.rows[0] });
});
exports.getStudentTransport = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT st.*, s.student_name, s.admission_no, r.name AS route_name, r.vehicle_no, ts.stop_name, ts.pickup_time
     FROM student_transport st JOIN students s ON s.id = st.student_id
     JOIN transport_routes r ON r.id = st.route_id LEFT JOIN transport_stops ts ON ts.id = st.stop_id
     ORDER BY s.student_name`
  );
  res.json({ success: true, data: result.rows });
});
exports.deleteTransportAssignment = genericDelete('student_transport');

// ─── Library ──────────────────────────────────────────────────
exports.getLibraryBooks = genericList('library_books', 'title ASC');
exports.createLibraryBook = asyncHandler(async (req, res) => {
  const b = req.body;
  const copies = parseInt(b.copies_total, 10) || 1;
  const result = await db.query(
    `INSERT INTO library_books (title, author, isbn, category, copies_total, copies_available, shelf_location) VALUES ($1,$2,$3,$4,$5,$5,$6) RETURNING *`,
    [b.title, b.author, b.isbn, b.category, copies, b.shelf_location]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateLibraryBook = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE library_books SET title=COALESCE($1,title), author=$2, isbn=$3, category=$4, copies_total=COALESCE($5,copies_total),
     shelf_location=$6, is_active=COALESCE($7,is_active) WHERE id=$8 RETURNING *`,
    [b.title, b.author, b.isbn, b.category, b.copies_total, b.shelf_location, b.is_active, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteLibraryBook = asyncHandler(async (req, res) => {
  const active = await db.query(
    `SELECT COUNT(*)::int AS c FROM library_issues WHERE book_id = $1 AND status = 'issued'`,
    [req.params.id]
  );
  if (active.rows[0].c > 0) {
    return res.status(400).json({ success: false, message: 'Cannot delete a book with active issues' });
  }
  await db.query('UPDATE library_books SET is_active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Book removed' });
});
exports.getLibraryIssues = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT li.*, b.title AS book_title, s.student_name FROM library_issues li
     JOIN library_books b ON b.id = li.book_id JOIN students s ON s.id = li.student_id ORDER BY li.issued_at DESC`
  );
  res.json({ success: true, data: result.rows });
});
exports.issueBook = asyncHandler(async (req, res) => {
  const b = req.body;
  const studentId = await resolveStudentId(b.student_id);
  if (!studentId) return res.status(400).json({ success: false, message: 'Student not found. Select a student or use a valid admission number.' });
  const book = await db.query('SELECT copies_available FROM library_books WHERE id = $1', [b.book_id]);
  if (!book.rows.length || book.rows[0].copies_available < 1) {
    return res.status(400).json({ success: false, message: 'No copies available' });
  }
  const result = await db.query(
    `INSERT INTO library_issues (book_id, student_id, due_date) VALUES ($1,$2,$3) RETURNING *`,
    [b.book_id, studentId, b.due_date]
  );
  await db.query('UPDATE library_books SET copies_available = copies_available - 1 WHERE id = $1', [b.book_id]);
  await logErp(req, 'issue_library_book', 'library_issue', result.rows[0].id, { book_id: b.book_id, student_id: studentId });
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.returnBook = asyncHandler(async (req, res) => {
  const issue = await db.query('SELECT * FROM library_issues WHERE id = $1', [req.params.id]);
  if (!issue.rows.length) return res.status(404).json({ success: false, message: 'Issue not found' });
  await db.query(
    `UPDATE library_issues SET returned_at = CURRENT_DATE, status = 'returned', fine_amount = COALESCE($1, 0) WHERE id = $2`,
    [req.body.fine_amount || 0, req.params.id]
  );
  await db.query('UPDATE library_books SET copies_available = copies_available + 1 WHERE id = $1', [issue.rows[0].book_id]);
  await logErp(req, 'return_library_book', 'library_issue', req.params.id, { fine_amount: req.body.fine_amount || 0 });
  res.json({ success: true, message: 'Book returned' });
});

// ─── Payroll ──────────────────────────────────────────────────
exports.getPayrollStaff = genericList('payroll_staff', 'name ASC');
exports.createPayrollStaff = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO payroll_staff (faculty_id, name, designation, department, bank_account, base_salary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.faculty_id, b.name, b.designation, b.department, b.bank_account, b.base_salary || 0]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updatePayrollStaff = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE payroll_staff SET faculty_id=$1, name=COALESCE($2,name), designation=$3, department=$4,
     bank_account=$5, base_salary=COALESCE($6,base_salary), is_active=COALESCE($7,is_active) WHERE id=$8 RETURNING *`,
    [b.faculty_id || null, b.name, b.designation, b.department, b.bank_account, b.base_salary, b.is_active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Staff not found' });
  res.json({ success: true, data: result.rows[0] });
});
exports.deletePayrollStaff = asyncHandler(async (req, res) => {
  await db.query('UPDATE payroll_staff SET is_active = FALSE WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Staff deactivated' });
});
exports.getPayrollRuns = asyncHandler(async (req, res) => {
  const runs = await db.query('SELECT * FROM payroll_runs ORDER BY year DESC, month DESC');
  const entries = await db.query(
    `SELECT pe.*, ps.name AS staff_name, ps.designation, ps.department, pr.month, pr.year
     FROM payroll_entries pe
     JOIN payroll_staff ps ON ps.id = pe.staff_id
     JOIN payroll_runs pr ON pr.id = pe.run_id
     ORDER BY pe.created_at DESC`
  );
  res.json({ success: true, data: { runs: runs.rows, entries: entries.rows } });
});
exports.createPayrollRun = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  const run = await db.query(
    `INSERT INTO payroll_runs (month, year) VALUES ($1,$2) ON CONFLICT (month, year) DO UPDATE SET status='draft' RETURNING *`,
    [month, year]
  );
  const staff = await db.query('SELECT * FROM payroll_staff WHERE is_active = TRUE');
  for (const s of staff.rows) {
    const allowances = { hra: Math.round(s.base_salary * 0.1) };
    const deductions = { pf: Math.round(s.base_salary * 0.12) };
    const net = Number(s.base_salary) + allowances.hra - deductions.pf;
    await db.query(
      `INSERT INTO payroll_entries (run_id, staff_id, base_salary, allowances, deductions, net_salary)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (run_id, staff_id) DO NOTHING`,
      [run.rows[0].id, s.id, s.base_salary, JSON.stringify(allowances), JSON.stringify(deductions), net]
    );
  }
  await logErp(req, 'create_payroll_run', 'payroll_run', run.rows[0].id, { month, year });
  res.status(201).json({ success: true, data: run.rows[0] });
});
exports.processPayrollRun = asyncHandler(async (req, res) => {
  await db.query(`UPDATE payroll_runs SET status = 'processed', processed_at = NOW() WHERE id = $1`, [req.params.id]);
  await db.query(`UPDATE payroll_entries SET status = 'paid' WHERE run_id = $1`, [req.params.id]);
  await logErp(req, 'process_payroll_run', 'payroll_run', req.params.id);
  res.json({ success: true, message: 'Payroll processed' });
});

// ─── Certificates ─────────────────────────────────────────────
exports.getCertificates = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT c.*, s.student_name, s.admission_no, s.class_level FROM certificates c
     JOIN students s ON s.id = c.student_id ORDER BY c.issued_date DESC`
  );
  res.json({ success: true, data: result.rows });
});
exports.createCertificate = asyncHandler(async (req, res) => {
  const b = req.body;
  const studentId = await resolveStudentId(b.student_id);
  if (!studentId) return res.status(400).json({ success: false, message: 'Student not found. Select a student or use a valid admission number.' });
  const year = new Date().getFullYear();
  const count = await db.query('SELECT COUNT(*)::int AS c FROM certificates');
  const certNo = b.certificate_no || `CERT-${year}-${String(count.rows[0].c + 1).padStart(5, '0')}`;
  const student = await db.query('SELECT * FROM students WHERE id = $1', [studentId]);
  let templateBody = null;
  if (b.template_id) {
    const tpl = await db.query('SELECT * FROM certificate_templates WHERE id = $1', [b.template_id]);
    templateBody = tpl.rows[0] || null;
  }
  const result = await db.query(
    `INSERT INTO certificates (student_id, certificate_type, certificate_no, issued_date, reason, data, issued_by, template_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [studentId, b.certificate_type, certNo, b.issued_date || new Date(), b.reason, JSON.stringify({ student: student.rows[0], template: templateBody, ...b.data }), req.user?.id, b.template_id || null]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.deleteCertificate = genericDelete('certificates');
exports.updateCertificate = asyncHandler(async (req, res) => {
  const b = req.body;
  let studentId;
  if (b.student_id) {
    studentId = await resolveStudentId(b.student_id);
    if (!studentId) return res.status(400).json({ success: false, message: 'Student not found' });
  }
  const result = await db.query(
    `UPDATE certificates SET
      student_id = COALESCE($1, student_id),
      certificate_type = COALESCE($2, certificate_type),
      template_id = $3,
      issued_date = COALESCE($4, issued_date),
      reason = $5
     WHERE id = $6 RETURNING *`,
    [studentId, b.certificate_type, b.template_id || null, b.issued_date, b.reason, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Certificate not found' });
  res.json({ success: true, data: result.rows[0] });
});

exports.getCertificateTemplates = genericList('certificate_templates', 'name ASC');
exports.createCertificateTemplate = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO certificate_templates (name, certificate_type, title_text, body_template, footer_text, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.name, b.certificate_type || 'bonafide', b.title_text, b.body_template, b.footer_text, b.is_active !== false]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateCertificateTemplate = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE certificate_templates SET name=COALESCE($1,name), certificate_type=$2, title_text=$3,
     body_template=COALESCE($4,body_template), footer_text=$5, is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *`,
    [b.name, b.certificate_type, b.title_text, b.body_template, b.footer_text, b.is_active, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteCertificateTemplate = genericDelete('certificate_templates');

exports.getTeachers = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, designation, department FROM faculty
     WHERE is_active = TRUE AND (deleted_at IS NULL) ORDER BY name ASC`
  );
  res.json({ success: true, data: result.rows });
});

exports.getFeeStats = asyncHandler(async (req, res) => {
  const [summary, byStatus] = await Promise.all([
    db.query(`
      SELECT
        COALESCE(SUM(amount), 0)::float AS total_billed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_amount ELSE 0 END), 0)::float AS total_collected,
        COALESCE(SUM(CASE WHEN status != 'paid' THEN amount - COALESCE(paid_amount, 0) ELSE 0 END), 0)::float AS total_pending,
        COUNT(*)::int AS invoice_count
      FROM fee_invoices
    `),
    db.query(`
      SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS amount
      FROM fee_invoices GROUP BY status ORDER BY status
    `),
  ]);
  res.json({ success: true, data: { summary: summary.rows[0], by_status: byStatus.rows } });
});

exports.bulkGenerateFeeInvoices = asyncHandler(async (req, res) => {
  const { fee_head_id, class_level, due_date, section } = req.body;
  if (!fee_head_id || !class_level) {
    return res.status(400).json({ success: false, message: 'fee_head_id and class_level required' });
  }
  const head = await db.query('SELECT * FROM fee_heads WHERE id = $1 AND is_active = TRUE', [fee_head_id]);
  if (!head.rows.length) return res.status(404).json({ success: false, message: 'Fee head not found' });

  let studentQuery = `SELECT id FROM students WHERE deleted_at IS NULL AND status = 'active' AND class_level = $1`;
  const params = [class_level];
  if (section) {
    studentQuery += ' AND section = $2';
    params.push(section);
  }
  const students = await db.query(studentQuery, params);
  const insert = await db.query(
    `INSERT INTO fee_invoices (student_id, fee_head_id, title, amount, due_date, status)
     SELECT s.id, $1, $2, $3, $4, 'pending'
     FROM students s
     WHERE s.deleted_at IS NULL AND s.status = 'active' AND s.class_level = $5
     AND ($6::text IS NULL OR s.section = $6)
     AND NOT EXISTS (
       SELECT 1 FROM fee_invoices fi WHERE fi.student_id = s.id AND fi.fee_head_id = $1 AND fi.status != 'cancelled'
     )
     RETURNING id`,
    [fee_head_id, head.rows[0].name, head.rows[0].amount, due_date || null, class_level, section || null]
  );
  await logErp(req, 'bulk_generate_fee_invoices', 'fee_invoice', fee_head_id, { created: insert.rows.length, class_level });
  res.json({ success: true, data: { created: insert.rows.length, total_students: students.rows.length } });
});

exports.getPayrollPayslip = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT pe.*, ps.name AS staff_name, ps.designation, ps.department, ps.bank_account,
            pr.month, pr.year, pr.status AS run_status
     FROM payroll_entries pe
     JOIN payroll_staff ps ON ps.id = pe.staff_id
     JOIN payroll_runs pr ON pr.id = pe.run_id
     WHERE pe.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ success: false, message: 'Payslip not found' });
  res.json({ success: true, data: result.rows[0] });
});

// ─── Alerts ───────────────────────────────────────────────────
exports.getAlertTemplates = genericList('alert_templates', 'name ASC');
exports.createAlertTemplate = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `INSERT INTO alert_templates (name, channel, event_type, template_body) VALUES ($1,$2,$3,$4) RETURNING *`,
    [b.name, b.channel || 'whatsapp', b.event_type, b.template_body]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
});
exports.updateAlertTemplate = asyncHandler(async (req, res) => {
  const b = req.body;
  const result = await db.query(
    `UPDATE alert_templates SET name=COALESCE($1,name), channel=$2, event_type=$3, template_body=COALESCE($4,template_body), is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *`,
    [b.name, b.channel, b.event_type, b.template_body, b.is_active, req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
});
exports.deleteAlertTemplate = genericDelete('alert_templates');
exports.getAlertLogs = genericList('alert_logs', 'created_at DESC');
exports.sendAlert = asyncHandler(async (req, res) => {
  const { recipient, message, channel } = req.body;
  const status = await dispatchAlert({ recipient, message, channel: channel || 'whatsapp' });
  await logErp(req, 'send_alert', 'alert', recipient, { channel: channel || 'whatsapp', status });
  res.json({ success: true, data: { status } });
});

// ─── Portal ───────────────────────────────────────────────────
exports.portalLoginValidation = [
  body('account_type').isIn(['parent', 'student']),
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
];

exports.portalLogin = asyncHandler(async (req, res) => {
  const { account_type, username, password } = req.body;
  const result = await db.query(
    `SELECT pa.*, s.student_name, s.admission_no FROM portal_accounts pa
     JOIN students s ON s.id = pa.student_id
     WHERE pa.account_type = $1 AND pa.username = $2 AND pa.is_active = TRUE AND s.deleted_at IS NULL`,
    [account_type, username]
  );
  const account = result.rows[0];
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  await db.query('UPDATE portal_accounts SET last_login = NOW() WHERE id = $1', [account.id]);
  const token = tokenPortal(account);
  res.json({
    success: true,
    data: {
      token,
      account: {
        type: account.account_type,
        student_name: account.student_name,
        admission_no: account.admission_no,
        student_id: account.student_id,
      },
    },
  });
});

exports.portalMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.portal });
});

exports.provisionPortalAccounts = asyncHandler(async (req, res) => {
  const students = await db.query('SELECT id, admission_no FROM students WHERE deleted_at IS NULL');
  for (const s of students.rows) await ensurePortalAccounts(s.id, s.admission_no);
  res.json({ success: true, message: `Portal accounts provisioned for ${students.rows.length} students` });
});

exports.getPortalDashboard = asyncHandler(async (req, res) => {
  const sid = req.portal.student_id;
  const cls = req.portal.class_level;
  const sec = req.portal.section || 'A';
  const [attendance, homework, fees, timetable, marks, transport, attSummary, feeSummary, library] = await Promise.all([
    db.query(`SELECT * FROM attendance_records WHERE student_id = $1 ORDER BY attendance_date DESC LIMIT 30`, [sid]),
    db.query(
      `SELECT * FROM homework_assignments WHERE class_level = $1 AND deleted_at IS NULL AND is_active = TRUE
       AND (section IS NULL OR section = '' OR section = $2) ORDER BY due_date DESC NULLS LAST LIMIT 10`,
      [cls, sec]
    ),
    db.query(
      `SELECT fi.*, fh.name AS fee_head_name
       FROM fee_invoices fi
       LEFT JOIN fee_heads fh ON fh.id = fi.fee_head_id
       WHERE fi.student_id = $1 ORDER BY fi.due_date DESC NULLS LAST`,
      [sid]
    ),
    db.query(`SELECT * FROM timetable_slots WHERE class_level = $1 AND section = $2 AND is_active = TRUE ORDER BY day_of_week, period_number`, [cls, sec]),
    db.query(
      `SELECT em.*, e.subject, e.name AS exam_name, e.max_marks FROM exam_marks em
       JOIN exams e ON e.id = em.exam_id WHERE em.student_id = $1 AND e.results_published = TRUE
       ORDER BY e.exam_date DESC NULLS LAST`,
      [sid]
    ),
    db.query(`SELECT st.*, r.name AS route_name, ts.stop_name FROM student_transport st JOIN transport_routes r ON r.id = st.route_id LEFT JOIN transport_stops ts ON ts.id = st.stop_id WHERE st.student_id = $1`, [sid]),
    db.query(
      `SELECT status, COUNT(*)::int AS count FROM attendance_records
       WHERE student_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY status`,
      [sid]
    ),
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_total,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN COALESCE(paid_amount, amount) ELSE 0 END), 0) AS paid_total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count
       FROM fee_invoices WHERE student_id = $1`,
      [sid]
    ),
    db.query(
      `SELECT li.*, lb.title AS book_title, lb.author
       FROM library_issues li
       JOIN library_books lb ON lb.id = li.book_id
       WHERE li.student_id = $1
       ORDER BY li.issued_at DESC NULLS LAST LIMIT 20`,
      [sid]
    ),
  ]);
  const attStats = { present: 0, absent: 0, late: 0, half_day: 0 };
  attSummary.rows.forEach((r) => { attStats[r.status] = r.count; });
  const attTotal = Object.values(attStats).reduce((a, b) => a + b, 0);
  res.json({
    success: true,
    data: {
      student: {
        name: req.portal.student_name,
        admission_no: req.portal.admission_no,
        class_level: cls,
        section: req.portal.section,
        account_type: req.portal.account_type,
        parent_name: req.portal.parent_name,
      },
      attendance: attendance.rows,
      attendance_stats: { ...attStats, total: attTotal, rate: attTotal ? Math.round((attStats.present / attTotal) * 100) : null },
      homework: homework.rows,
      fees: fees.rows,
      fee_summary: feeSummary.rows[0] || { pending_total: 0, paid_total: 0, pending_count: 0 },
      timetable: timetable.rows,
      marks: marks.rows,
      transport: transport.rows[0] || null,
      library: library.rows,
    },
  });
});

exports.adminOnly = adminOnly;
