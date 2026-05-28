const { body } = require('express-validator');
const db = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { logActivity } = require('../utils/activityLog');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { ensurePortalAccounts } = require('../utils/portalAccounts');

const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

async function nextAdmissionNo() {
  const year = new Date().getFullYear();
  const prefix = `STS-${year}-`;
  const result = await db.query(
    `SELECT admission_no FROM students
     WHERE admission_no LIKE $1 AND deleted_at IS NULL
     ORDER BY admission_no DESC LIMIT 1`,
    [`${prefix}%`]
  );
  const last = result.rows[0]?.admission_no;
  const seq = last ? parseInt(last.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function normalizeStudentInput(row) {
  return {
    admission_no: row.admission_no?.trim() || null,
    student_name: row.student_name?.trim(),
    class_level: row.class_level?.trim(),
    section: row.section?.trim() || null,
    roll_no: row.roll_no?.trim() || null,
    gender: row.gender?.trim() || null,
    date_of_birth: row.date_of_birth || null,
    parent_name: row.parent_name?.trim() || null,
    parent_phone: row.parent_phone?.trim() || null,
    parent_email: row.parent_email?.trim() || null,
    address: row.address?.trim() || null,
    status: row.status?.trim() || 'active',
    academic_year: row.academic_year?.trim() || '2026-27',
    enrolled_at: row.enrolled_at || null,
  };
}

exports.getStudents = asyncHandler(async (req, res) => {
  const { class: classLevel, status, search, all } = req.query;

  if (all === 'true') {
    let query = `SELECT * FROM students WHERE deleted_at IS NULL`;
    const params = [];
    let i = 1;
    if (classLevel) { query += ` AND class_level = $${i++}`; params.push(classLevel); }
    if (status) { query += ` AND status = $${i++}`; params.push(status); }
    if (search) {
      query += ` AND (student_name ILIKE $${i} OR admission_no ILIKE $${i} OR parent_name ILIKE $${i})`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY class_level ASC, section ASC, student_name ASC LIMIT 5000`;
    const result = await db.query(query, params);
    return res.json({ success: true, data: result.rows });
  }

  const { page, limit, offset } = parsePagination(req.query, { defaultLimit: 25 });
  let where = 'WHERE deleted_at IS NULL';
  const params = [];
  let i = 1;

  if (classLevel) { where += ` AND class_level = $${i++}`; params.push(classLevel); }
  if (status) { where += ` AND status = $${i++}`; params.push(status); }
  if (search) {
    where += ` AND (student_name ILIKE $${i} OR admission_no ILIKE $${i} OR parent_name ILIKE $${i} OR parent_phone ILIKE $${i})`;
    params.push(`%${search}%`);
    i++;
  }

  const count = await db.query(`SELECT COUNT(*)::int AS total FROM students ${where}`, params);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM students ${where} ORDER BY class_level ASC, section ASC, student_name ASC LIMIT $${i} OFFSET $${i + 1}`,
    params
  );
  res.json(paginatedResponse(result.rows, count.rows[0].total, page, limit));
});

exports.studentValidation = [
  body('student_name').trim().notEmpty(),
  body('class_level').trim().notEmpty(),
  body('admission_no').optional().trim(),
  body('status').optional().trim(),
];

exports.createStudent = asyncHandler(async (req, res) => {
  const input = normalizeStudentInput(req.body);
  if (!input.student_name || !input.class_level) {
    return res.status(400).json({ success: false, message: 'Student name and class are required' });
  }

  const admissionNo = input.admission_no || (await nextAdmissionNo());

  const result = await db.query(
    `INSERT INTO students (
      admission_no, student_name, class_level, section, roll_no, gender, date_of_birth,
      parent_name, parent_phone, parent_email, address, status, academic_year, enrolled_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, CURRENT_DATE))
    RETURNING *`,
    [
      admissionNo,
      input.student_name,
      input.class_level,
      input.section,
      input.roll_no,
      input.gender,
      input.date_of_birth || null,
      input.parent_name,
      input.parent_phone,
      input.parent_email,
      input.address,
      input.status,
      input.academic_year,
      input.enrolled_at,
    ]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'create_student',
    entityType: 'student',
    entityId: result.rows[0].id,
    ip: req.ip,
  });

  await ensurePortalAccounts(result.rows[0].id, admissionNo);

  res.status(201).json({ success: true, data: result.rows[0] });
});

exports.updateStudent = asyncHandler(async (req, res) => {
  const existing = await db.query('SELECT id FROM students WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
  if (!existing.rows.length) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  const input = normalizeStudentInput(req.body);

  const result = await db.query(
    `UPDATE students SET
      admission_no = COALESCE($1, admission_no),
      student_name = COALESCE($2, student_name),
      class_level = COALESCE($3, class_level),
      section = $4,
      roll_no = $5,
      gender = $6,
      date_of_birth = $7,
      parent_name = $8,
      parent_phone = $9,
      parent_email = $10,
      address = $11,
      status = COALESCE($12, status),
      academic_year = COALESCE($13, academic_year),
      enrolled_at = COALESCE($14, enrolled_at)
     WHERE id = $15 AND deleted_at IS NULL
     RETURNING *`,
    [
      input.admission_no,
      input.student_name,
      input.class_level,
      input.section,
      input.roll_no,
      input.gender,
      input.date_of_birth || null,
      input.parent_name,
      input.parent_phone,
      input.parent_email,
      input.address,
      input.status,
      input.academic_year,
      input.enrolled_at,
      req.params.id,
    ]
  );

  await logActivity({
    userId: req.user?.id,
    action: 'update_student',
    entityType: 'student',
    entityId: req.params.id,
    ip: req.ip,
  });

  res.json({ success: true, data: result.rows[0] });
});

exports.deleteStudent = asyncHandler(async (req, res) => {
  const result = await db.query(
    'UPDATE students SET deleted_at = NOW(), status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING id',
    ['inactive', req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  await logActivity({
    userId: req.user?.id,
    action: 'delete_student',
    entityType: 'student',
    entityId: req.params.id,
    ip: req.ip,
  });

  res.json({ success: true, message: 'Student removed' });
});

exports.bulkImportStudents = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body.students) ? req.body.students : [];
  if (!rows.length) {
    return res.status(400).json({ success: false, message: 'No student rows provided' });
  }

  const inserted = [];
  const errors = [];

  for (let index = 0; index < rows.length; index++) {
    const input = normalizeStudentInput(rows[index]);
    if (!input.student_name || !input.class_level) {
      errors.push({ row: index + 1, message: 'Missing student_name or class_level' });
      continue;
    }

    try {
      const admissionNo = input.admission_no || (await nextAdmissionNo());
      const result = await db.query(
        `INSERT INTO students (
          admission_no, student_name, class_level, section, roll_no, gender, date_of_birth,
          parent_name, parent_phone, parent_email, address, status, academic_year, enrolled_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14, CURRENT_DATE))
        ON CONFLICT (admission_no) DO UPDATE SET
          student_name = EXCLUDED.student_name,
          class_level = EXCLUDED.class_level,
          section = EXCLUDED.section,
          roll_no = EXCLUDED.roll_no,
          gender = EXCLUDED.gender,
          date_of_birth = EXCLUDED.date_of_birth,
          parent_name = EXCLUDED.parent_name,
          parent_phone = EXCLUDED.parent_phone,
          parent_email = EXCLUDED.parent_email,
          address = EXCLUDED.address,
          status = EXCLUDED.status,
          academic_year = EXCLUDED.academic_year,
          deleted_at = NULL
        RETURNING *`,
        [
          admissionNo,
          input.student_name,
          input.class_level,
          input.section,
          input.roll_no,
          input.gender,
          input.date_of_birth || null,
          input.parent_name,
          input.parent_phone,
          input.parent_email,
          input.address,
          input.status,
          input.academic_year,
          input.enrolled_at,
        ]
      );
      inserted.push(result.rows[0]);
      await ensurePortalAccounts(result.rows[0].id, result.rows[0].admission_no);
    } catch (err) {
      errors.push({ row: index + 1, message: err.message || 'Insert failed' });
    }
  }

  await logActivity({
    userId: req.user?.id,
    action: 'bulk_import_students',
    entityType: 'student',
    details: { inserted: inserted.length, errors: errors.length },
    ip: req.ip,
  });

  res.json({
    success: true,
    data: { inserted: inserted.length, failed: errors.length, errors, students: inserted },
  });
});

exports.exportStudents = asyncHandler(async (_req, res) => {
  const result = await db.query(
    `SELECT admission_no, student_name, class_level, section, roll_no, gender, date_of_birth,
            parent_name, parent_phone, parent_email, address, status, academic_year, enrolled_at
     FROM students WHERE deleted_at IS NULL ORDER BY class_level, student_name`
  );

  const headers = [
    'admission_no', 'student_name', 'class_level', 'section', 'roll_no', 'gender', 'date_of_birth',
    'parent_name', 'parent_phone', 'parent_email', 'address', 'status', 'academic_year', 'enrolled_at',
  ];
  const csv = [
    headers.join(','),
    ...result.rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students-export.csv');
  res.send(csv);
});

exports.downloadTemplate = asyncHandler(async (_req, res) => {
  const headers = [
    'admission_no', 'student_name', 'class_level', 'section', 'roll_no', 'gender', 'date_of_birth',
    'parent_name', 'parent_phone', 'parent_email', 'address', 'status', 'academic_year', 'enrolled_at',
  ];
  const sample = [
    '',
    'Rahul Sharma',
    'Class V',
    'A',
    '12',
    'Male',
    '2015-04-12',
    'Mr. Sharma',
    '+91 9876543210',
    'parent@email.com',
    'Hyderabad',
    'active',
    '2026-27',
    '2026-04-01',
  ];

  const csv = [headers.join(','), sample.map(csvEscape).join(',')].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=students-import-template.csv');
  res.send(csv);
});

exports.getStudentStats = asyncHandler(async (_req, res) => {
  const [total, byClass, byStatus] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS count FROM students WHERE deleted_at IS NULL'),
    db.query(
      `SELECT class_level, COUNT(*)::int AS count FROM students WHERE deleted_at IS NULL GROUP BY class_level ORDER BY class_level`
    ),
    db.query(
      `SELECT status, COUNT(*)::int AS count FROM students WHERE deleted_at IS NULL GROUP BY status ORDER BY status`
    ),
  ]);

  res.json({
    success: true,
    data: {
      total: total.rows[0].count,
      by_class: byClass.rows,
      by_status: byStatus.rows,
    },
  });
});
