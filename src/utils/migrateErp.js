require('dotenv').config();
const db = require('../config/db');

const ERP_PERMISSIONS = [
  'attendance', 'timetable', 'homework', 'exams', 'fees',
  'transport', 'library', 'payroll', 'certificates', 'alerts',
  'parent-portal', 'student-portal',
];

async function migrate() {
  console.log('Creating ERP module tables...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attendance_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'present',
      class_level VARCHAR(50),
      section VARCHAR(20),
      notes TEXT,
      marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, attendance_date)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      class_level VARCHAR(50) NOT NULL,
      section VARCHAR(20) DEFAULT 'A',
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      period_number SMALLINT NOT NULL,
      subject VARCHAR(100) NOT NULL,
      teacher_name VARCHAR(150),
      start_time TIME,
      end_time TIME,
      room VARCHAR(50),
      academic_year VARCHAR(20) DEFAULT '2026-27',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS homework_assignments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      class_level VARCHAR(50) NOT NULL,
      section VARCHAR(20),
      subject VARCHAR(100),
      due_date DATE,
      attachments JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT TRUE,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS exam_terms (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      academic_year VARCHAR(20) DEFAULT '2026-27',
      start_date DATE,
      end_date DATE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS exams (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      term_id UUID REFERENCES exam_terms(id) ON DELETE SET NULL,
      name VARCHAR(150) NOT NULL,
      class_level VARCHAR(50) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      exam_date DATE,
      max_marks NUMERIC(6,2) DEFAULT 100,
      pass_marks NUMERIC(6,2) DEFAULT 35,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS exam_marks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      marks_obtained NUMERIC(6,2),
      grade VARCHAR(10),
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(exam_id, student_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_heads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(150) NOT NULL,
      amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      class_level VARCHAR(50),
      frequency VARCHAR(30) DEFAULT 'annual',
      academic_year VARCHAR(20) DEFAULT '2026-27',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      fee_head_id UUID REFERENCES fee_heads(id) ON DELETE SET NULL,
      title VARCHAR(150) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      due_date DATE,
      status VARCHAR(30) DEFAULT 'pending',
      paid_amount NUMERIC(10,2) DEFAULT 0,
      paid_at TIMESTAMPTZ,
      payment_mode VARCHAR(50),
      reference_no VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS transport_routes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(150) NOT NULL,
      vehicle_no VARCHAR(50),
      driver_name VARCHAR(150),
      driver_phone VARCHAR(20),
      capacity INTEGER DEFAULT 40,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS transport_stops (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
      stop_name VARCHAR(150) NOT NULL,
      pickup_time TIME,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS student_transport (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      route_id UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
      stop_id UUID REFERENCES transport_stops(id) ON DELETE SET NULL,
      academic_year VARCHAR(20) DEFAULT '2026-27',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, academic_year)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS library_books (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      author VARCHAR(150),
      isbn VARCHAR(50),
      category VARCHAR(100),
      copies_total INTEGER DEFAULT 1,
      copies_available INTEGER DEFAULT 1,
      shelf_location VARCHAR(50),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS library_issues (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      book_id UUID NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      issued_at DATE DEFAULT CURRENT_DATE,
      due_date DATE,
      returned_at DATE,
      fine_amount NUMERIC(8,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'issued',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_staff (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      faculty_id UUID REFERENCES faculty(id) ON DELETE SET NULL,
      name VARCHAR(150) NOT NULL,
      designation VARCHAR(150),
      department VARCHAR(100),
      bank_account VARCHAR(50),
      base_salary NUMERIC(12,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
      year INTEGER NOT NULL,
      status VARCHAR(30) DEFAULT 'draft',
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(month, year)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payroll_entries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES payroll_staff(id) ON DELETE CASCADE,
      base_salary NUMERIC(12,2) DEFAULT 0,
      allowances JSONB DEFAULT '{}',
      deductions JSONB DEFAULT '{}',
      net_salary NUMERIC(12,2) DEFAULT 0,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(run_id, staff_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS certificates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      certificate_type VARCHAR(30) NOT NULL,
      certificate_no VARCHAR(50) UNIQUE NOT NULL,
      issued_date DATE DEFAULT CURRENT_DATE,
      reason TEXT,
      data JSONB DEFAULT '{}',
      issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(150) NOT NULL,
      channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
      event_type VARCHAR(50) NOT NULL,
      template_body TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      template_id UUID REFERENCES alert_templates(id) ON DELETE SET NULL,
      recipient VARCHAR(100) NOT NULL,
      channel VARCHAR(30) NOT NULL,
      message TEXT NOT NULL,
      status VARCHAR(30) DEFAULT 'queued',
      metadata JSONB DEFAULT '{}',
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS portal_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('parent', 'student')),
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      username VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(account_type, username)
    )
  `);

  const triggerTables = [
    'attendance_records', 'timetable_slots', 'homework_assignments', 'exam_terms', 'exams',
    'exam_marks', 'fee_heads', 'fee_invoices', 'transport_routes',
    'library_books', 'library_issues', 'payroll_staff', 'payroll_entries',
    'alert_templates', 'portal_accounts',
  ];

  for (const table of triggerTables) {
    await db.query(`DROP TRIGGER IF EXISTS trg_${table}_updated ON ${table}`);
    await db.query(`
      CREATE TRIGGER trg_${table}_updated
      BEFORE UPDATE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  await db.query(`
    INSERT INTO alert_templates (name, channel, event_type, template_body) VALUES
      ('Absence Alert', 'whatsapp', 'attendance_absent', 'Dear Parent, {{student_name}} was marked absent on {{date}}. - Smart School'),
      ('Fee Reminder', 'whatsapp', 'fee_due', 'Dear Parent, fee of Rs.{{amount}} for {{student_name}} is due on {{due_date}}. - Smart School'),
      ('Homework Posted', 'whatsapp', 'homework_new', 'New homework for {{class_level}}: {{title}}. Due {{due_date}}. - Smart School')
    ON CONFLICT DO NOTHING
  `).catch(() => {});

  for (const perm of ERP_PERMISSIONS) {
    await db.query(`
      UPDATE roles
      SET permissions = (
        SELECT jsonb_agg(DISTINCT value)
        FROM jsonb_array_elements_text(
          CASE WHEN permissions @> '["*"]'::jsonb THEN permissions
          ELSE permissions || $1::jsonb END
        ) AS value
      )
      WHERE name = 'admin' AND NOT permissions @> $1
    `, [JSON.stringify([perm])]);
  }

  console.log('ERP migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
