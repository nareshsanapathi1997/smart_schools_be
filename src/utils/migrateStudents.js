require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Ensuring students table exists...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admission_no VARCHAR(50) UNIQUE NOT NULL,
      student_name VARCHAR(150) NOT NULL,
      class_level VARCHAR(50) NOT NULL,
      section VARCHAR(20),
      roll_no VARCHAR(20),
      gender VARCHAR(20),
      date_of_birth DATE,
      parent_name VARCHAR(150),
      parent_phone VARCHAR(20),
      parent_email VARCHAR(255),
      address TEXT,
      status VARCHAR(30) DEFAULT 'active',
      academic_year VARCHAR(20) DEFAULT '2026-27',
      enrolled_at DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_level) WHERE deleted_at IS NULL
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_students_status ON students(status) WHERE deleted_at IS NULL
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_students_admission ON students(admission_no) WHERE deleted_at IS NULL
  `);

  await db.query(`DROP TRIGGER IF EXISTS trg_students_updated ON students`);
  await db.query(`
    CREATE TRIGGER trg_students_updated
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  await db.query(`
    UPDATE roles
    SET permissions = (
      SELECT jsonb_agg(DISTINCT value)
      FROM jsonb_array_elements_text(permissions || '["students","features"]'::jsonb) AS value
    )
    WHERE name = 'admin' AND NOT permissions @> '["students"]'::jsonb
  `);

  console.log('Students migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
