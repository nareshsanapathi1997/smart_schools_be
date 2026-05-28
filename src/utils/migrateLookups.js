require('dotenv').config();
const db = require('../config/db');

const LOOKUPS = {
  department: [
    ['administration', 'Administration', 1],
    ['mathematics', 'Mathematics', 2],
    ['science', 'Science', 3],
    ['english', 'English', 4],
    ['social_studies', 'Social Studies', 5],
    ['computer_science', 'Computer Science', 6],
    ['physical_education', 'Physical Education', 7],
    ['arts', 'Arts & Music', 8],
  ],
  admission_class: [
    ['nursery', 'Nursery', 1],
    ['lkg', 'LKG', 2],
    ['ukg', 'UKG', 3],
    ['class_i', 'Class I', 4],
    ['class_ii', 'Class II', 5],
    ['class_iii', 'Class III', 6],
    ['class_iv', 'Class IV', 7],
    ['class_v', 'Class V', 8],
    ['class_vi', 'Class VI', 9],
    ['class_vii', 'Class VII', 10],
    ['class_viii', 'Class VIII', 11],
    ['class_ix', 'Class IX', 12],
    ['class_x', 'Class X', 13],
    ['class_xi', 'Class XI', 14],
    ['class_xii', 'Class XII', 15],
  ],
  course_class: [
    ['primary', 'Primary', 1],
    ['middle', 'Middle', 2],
    ['secondary', 'Secondary', 3],
    ['senior', 'Senior', 4],
  ],
  enquiry_status: [
    ['new', 'New', 1, { color: 'blue' }],
    ['contacted', 'Contacted', 2, { color: 'amber' }],
    ['enrolled', 'Enrolled', 3, { color: 'emerald' }],
    ['rejected', 'Rejected', 4, { color: 'red' }],
  ],
  announcement_type: [
    ['general', 'General', 1],
    ['admission', 'Admission', 2],
    ['event', 'Event', 3],
    ['news', 'News', 4],
  ],
  gallery_category: [
    ['campus', 'Campus', 1],
    ['events', 'Events', 2],
    ['sports', 'Sports', 3],
    ['classroom', 'Classroom', 4],
    ['videos', 'Videos', 5],
    ['labs', 'Labs', 6],
  ],
  achievement_category: [
    ['academic', 'Academic', 1],
    ['sports', 'Sports', 2],
    ['award', 'Award', 3],
    ['competition', 'Competition', 4],
  ],
  subject: [
    ['mathematics', 'Mathematics', 1],
    ['english', 'English', 2],
    ['science', 'Science', 3],
    ['physics', 'Physics', 4],
    ['chemistry', 'Chemistry', 5],
    ['biology', 'Biology', 6],
    ['social_studies', 'Social Studies', 7],
    ['hindi', 'Hindi', 8],
    ['telugu', 'Telugu', 9],
    ['computer_science', 'Computer Science', 10],
    ['physical_education', 'Physical Education', 11],
    ['arts', 'Arts', 12],
  ],
  section: [
    ['a', 'A', 1],
    ['b', 'B', 2],
    ['c', 'C', 3],
    ['d', 'D', 4],
  ],
};

async function migrate() {
  console.log('Ensuring lookup_values table exists...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS lookup_values (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      code VARCHAR(100) NOT NULL,
      label VARCHAR(150) NOT NULL,
      metadata JSONB DEFAULT '{}',
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      deleted_at TIMESTAMPTZ,
      UNIQUE(type, code)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lookup_values_type
    ON lookup_values(type)
    WHERE deleted_at IS NULL
  `);

  await db.query(`
    DROP TRIGGER IF EXISTS trg_lookup_values_updated ON lookup_values
  `);
  await db.query(`
    CREATE TRIGGER trg_lookup_values_updated
    BEFORE UPDATE ON lookup_values
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
  `);

  console.log('Seeding lookup values...');

  for (const [type, rows] of Object.entries(LOOKUPS)) {
    for (const row of rows) {
      const [code, label, sortOrder, metadata = {}] = row;
      await db.query(
        `INSERT INTO lookup_values (type, code, label, metadata, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (type, code) DO UPDATE
         SET label = EXCLUDED.label,
             metadata = EXCLUDED.metadata,
             sort_order = EXCLUDED.sort_order,
             deleted_at = NULL,
             is_active = TRUE`,
        [type, code, label, JSON.stringify(metadata), sortOrder]
      );
    }
  }

  console.log('Lookup migration complete.');

  await db.query(`
    UPDATE roles
    SET permissions = '["dashboard","leads","enquiries","courses","faculty","gallery","announcements","events","testimonials","achievements","chatbot","chat-logs","contacts","analytics","activity-logs","settings","users","departments","class-levels","lookups","students","features"]'::jsonb
    WHERE name = 'admin'
  `);
  await db.query(`
    UPDATE roles
    SET permissions = '["dashboard","gallery","announcements","events","testimonials","contacts","leads"]'::jsonb
    WHERE name = 'editor'
  `);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
