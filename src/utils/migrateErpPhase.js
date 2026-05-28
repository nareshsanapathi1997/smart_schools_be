/**
 * Phase 1–4 migration: ERP indexes, academic years, payments, teacher portal, schema extensions
 */
require('dotenv').config();
const db = require('../config/db');

async function run() {
  console.log('Running ERP phase migration (indexes + extensions)...');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(attendance_date)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(class_level, section, attendance_date)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance_records(student_id, attendance_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_fee_invoices_student ON fee_invoices(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_fee_invoices_status ON fee_invoices(status)',
    'CREATE INDEX IF NOT EXISTS idx_fee_invoices_due ON fee_invoices(due_date DESC NULLS LAST)',
    'CREATE INDEX IF NOT EXISTS idx_homework_class ON homework_assignments(class_level, section) WHERE deleted_at IS NULL',
    'CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable_slots(class_level, section) WHERE is_active = TRUE',
    'CREATE INDEX IF NOT EXISTS idx_exam_marks_student ON exam_marks(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_exams_term ON exams(term_id)',
    'CREATE INDEX IF NOT EXISTS idx_library_issues_book ON library_issues(book_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_library_issues_student ON library_issues(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_payroll_entries_run ON payroll_entries(run_id)',
    'CREATE INDEX IF NOT EXISTS idx_portal_accounts_student ON portal_accounts(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_alert_logs_created ON alert_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_student_transport_student ON student_transport(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_enquiries_mobile ON enquiries(mobile)',
    'CREATE INDEX IF NOT EXISTS idx_chatbot_logs_created ON chatbot_logs(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_students_class_section ON students(class_level, section) WHERE deleted_at IS NULL',
  ];

  for (const sql of indexes) {
    await db.query(sql);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS academic_years (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(20) NOT NULL UNIQUE,
      start_date DATE,
      end_date DATE,
      is_current BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    INSERT INTO academic_years (name, start_date, end_date, is_current)
    VALUES ('2026-27', '2026-04-01', '2027-03-31', TRUE)
    ON CONFLICT (name) DO NOTHING
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_payment_orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_id UUID NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      razorpay_order_id VARCHAR(100),
      razorpay_payment_id VARCHAR(100),
      amount NUMERIC(10,2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'INR',
      status VARCHAR(30) DEFAULT 'created',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS teacher_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      faculty_id UUID REFERENCES faculty(id) ON DELETE SET NULL,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id) ON DELETE SET NULL`);
  await db.query(`ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT FALSE`);

  console.log('ERP phase migration completed.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
