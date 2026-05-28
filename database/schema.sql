-- Smart School PostgreSQL Schema
-- Run: psql -U postgres -d smart_school -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (Admin)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role_id);

-- Master lookup values (departments, class levels, statuses, etc.)
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
);

CREATE INDEX idx_lookup_values_type ON lookup_values(type) WHERE deleted_at IS NULL;

-- Enrolled Students
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
);

CREATE INDEX idx_students_class ON students(class_level) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_status ON students(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_students_admission ON students(admission_no) WHERE deleted_at IS NULL;

-- Website Settings
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  category VARCHAR(50) DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  class_level VARCHAR(50),
  subjects JSONB DEFAULT '[]',
  fee_structure JSONB DEFAULT '{}',
  eligibility TEXT,
  duration VARCHAR(100),
  image_url TEXT,
  features JSONB DEFAULT '[]',
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_courses_slug ON courses(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_class ON courses(class_level) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_featured ON courses(is_featured) WHERE deleted_at IS NULL;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]';

-- Faculty
CREATE TABLE IF NOT EXISTS faculty (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  designation VARCHAR(150),
  department VARCHAR(100),
  qualification TEXT,
  experience VARCHAR(100),
  bio TEXT,
  image_url TEXT,
  email VARCHAR(255),
  phone VARCHAR(20),
  social_links JSONB DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_faculty_department ON faculty(department) WHERE deleted_at IS NULL;
CREATE INDEX idx_faculty_featured ON faculty(is_featured) WHERE deleted_at IS NULL;

-- Gallery
CREATE TABLE IF NOT EXISTS gallery (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) DEFAULT 'image',
  category VARCHAR(100) DEFAULT 'general',
  is_featured BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_gallery_category ON gallery(category) WHERE deleted_at IS NULL;

-- Achievements & Results
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'academic',
  student_name VARCHAR(150),
  rank VARCHAR(50),
  rank_order INTEGER DEFAULT 0,
  entry_type VARCHAR(20) DEFAULT 'award',
  year INTEGER,
  image_url TEXT,
  stats JSONB DEFAULT '{}',
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_achievements_year ON achievements(year) WHERE deleted_at IS NULL;
CREATE INDEX idx_achievements_topper_year ON achievements(year, rank_order)
  WHERE deleted_at IS NULL AND entry_type = 'topper';

-- Backfill columns on existing databases
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS rank_order INTEGER DEFAULT 0;
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS entry_type VARCHAR(20) DEFAULT 'award';
CREATE INDEX IF NOT EXISTS idx_achievements_topper_year ON achievements(year, rank_order)
  WHERE deleted_at IS NULL AND entry_type = 'topper';

UPDATE achievements SET entry_type = 'topper'
  WHERE student_name IS NOT NULL AND student_name <> '' AND entry_type = 'award';

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  type VARCHAR(50) DEFAULT 'general',
  is_pinned BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_announcements_active ON announcements(is_active, published_at DESC) WHERE deleted_at IS NULL;

-- Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  details TEXT,
  highlights JSONB DEFAULT '[]',
  location VARCHAR(255),
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_events_date ON events(event_date) WHERE deleted_at IS NULL;

ALTER TABLE events ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]';
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Testimonials
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  role VARCHAR(100),
  content TEXT NOT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
  image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Admission Enquiries
CREATE TABLE IF NOT EXISTS enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_name VARCHAR(150) NOT NULL,
  parent_name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  class_interested VARCHAR(50) NOT NULL,
  address TEXT,
  message TEXT,
  status VARCHAR(50) DEFAULT 'new',
  source VARCHAR(50) DEFAULT 'website',
  ip_address VARCHAR(45),
  is_spam BOOLEAN DEFAULT FALSE,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_enquiries_status ON enquiries(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_enquiries_created ON enquiries(created_at DESC) WHERE deleted_at IS NULL;

-- Chatbot FAQs (Knowledge Base)
CREATE TABLE IF NOT EXISTS chatbot_faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100) DEFAULT 'general',
  keywords JSONB DEFAULT '[]',
  language VARCHAR(10) DEFAULT 'en',
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_chatbot_faqs_category ON chatbot_faqs(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_chatbot_faqs_language ON chatbot_faqs(language) WHERE deleted_at IS NULL;

-- Chatbot Conversation Logs
CREATE TABLE IF NOT EXISTS chatbot_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(100) NOT NULL,
  channel VARCHAR(20) DEFAULT 'website',
  user_message TEXT,
  bot_response TEXT,
  language VARCHAR(10) DEFAULT 'en',
  metadata JSONB DEFAULT '{}',
  escalated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chatbot_logs_session ON chatbot_logs(session_id);
CREATE INDEX idx_chatbot_logs_channel ON chatbot_logs(channel);
CREATE INDEX idx_chatbot_logs_created ON chatbot_logs(created_at DESC);

-- Newsletter Subscriptions
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact Messages
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  subject VARCHAR(255),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','settings','courses','faculty','gallery','achievements','announcements','events','testimonials','enquiries','chatbot_faqs','lookup_values','roles','students']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- Seed default roles
INSERT INTO roles (name, permissions) VALUES
  ('super_admin', '["*"]'),
  ('admin', '["dashboard","leads","enquiries","courses","faculty","gallery","announcements","events","testimonials","achievements","chatbot","chat-logs","contacts","analytics","activity-logs","settings","users","departments","class-levels","lookups","students","features","attendance","timetable","homework","exams","fees","transport","library","payroll","certificates","alerts","portals"]'),
  ('editor', '["dashboard","gallery","announcements","events","testimonials","contacts","leads"]')
ON CONFLICT (name) DO NOTHING;

-- Seed default settings
INSERT INTO settings (key, value, category) VALUES
  ('school_info', '{"name":"Smart International School","tagline":"Excellence in Education","phone":"+91 98765 43210","email":"info@smartschool.edu","address":"123 Education Lane, Hyderabad, Telangana 500001","whatsapp":"919876543210","brochure_url":"/downloads/admission-brochure.pdf"}', 'general'),
  ('seo', '{"title":"Smart International School | Premium Education","description":"Leading smart school with AI-powered support, modern infrastructure, and academic excellence.","keywords":"school, education, admissions, hyderabad"}', 'seo'),
  ('social', '{"facebook":"#","instagram":"#","twitter":"#","youtube":"#","linkedin":"#"}', 'social'),
  ('stats', '{"students":"2500+","teachers":"150+","years":"25+","awards":"100+"}', 'general')
ON CONFLICT (key) DO NOTHING;

-- Seed sample FAQs
INSERT INTO chatbot_faqs (question, answer, category, keywords, language) VALUES
  ('What are the admission requirements?', 'Admissions require birth certificate, previous school records, passport photos, and address proof. Visit our Admissions page or submit an online enquiry.', 'admissions', '["admission","requirements","documents"]', 'en'),
  ('What are the school timings?', 'School hours are 8:30 AM to 3:30 PM, Monday through Friday. Saturday activities run 9:00 AM to 12:00 PM.', 'general', '["timing","hours","schedule"]', 'en'),
  ('Where is the school located?', 'We are located at 123 Education Lane, Hyderabad, Telangana 500001. Google Maps link is available on our Contact page.', 'contact', '["location","address","where"]', 'en'),
  ('ప్రవేశ అర్హత ఏమిటి?', 'ప్రవేశం కోసం జనన ధృవీకరణ పత్రం, గత పాఠశాల రికార్డులు, ఫోటోలు అవసరం. మా Admissions పేజీని చూడండి.', 'admissions', '["ప్రవేశ","అర్హత"]', 'te')
ON CONFLICT DO NOTHING;
