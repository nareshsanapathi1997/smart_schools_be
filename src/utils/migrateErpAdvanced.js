require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Running ERP advanced migration...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS certificate_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(150) NOT NULL,
      certificate_type VARCHAR(30) NOT NULL DEFAULT 'bonafide',
      title_text VARCHAR(255) DEFAULT 'Certificate of Achievement',
      body_template TEXT NOT NULL,
      footer_text TEXT DEFAULT 'Authorized Signatory',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE certificates
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES certificate_templates(id) ON DELETE SET NULL
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trg_certificate_templates_updated ON certificate_templates
  `);
  await db.query(`
    CREATE TRIGGER trg_certificate_templates_updated
    BEFORE UPDATE ON certificate_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  const defaults = [
    ['Bonafide Certificate', 'bonafide', 'Bonafide Certificate', 'This is to certify that {{student_name}} (Admission No: {{admission_no}}, Class: {{class_level}}-{{section}}) is a bonafide student of {{school_name}}.', 'Principal'],
    ['Transfer Certificate', 'tc', 'Transfer Certificate', 'This is to certify that {{student_name}} (Admission No: {{admission_no}}) was a student of Class {{class_level}} at {{school_name}} and is hereby granted Transfer Certificate.', 'Principal'],
    ['Character Certificate', 'character', 'Character Certificate', 'This is to certify that {{student_name}} (Admission No: {{admission_no}}, Class: {{class_level}}) has been a student of good moral character during their tenure at {{school_name}}.', 'Principal'],
  ];

  for (const [name, type, title, body, footer] of defaults) {
    const exists = await db.query(
      'SELECT id FROM certificate_templates WHERE certificate_type = $1 AND name = $2 LIMIT 1',
      [type, name]
    );
    if (!exists.rows.length) {
      await db.query(
        `INSERT INTO certificate_templates (name, certificate_type, title_text, body_template, footer_text)
         VALUES ($1::varchar, $2::varchar, $3::varchar, $4::text, $5::varchar)`,
        [name, type, title, body, footer]
      );
    }
  }

  console.log('ERP advanced migration complete.');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
