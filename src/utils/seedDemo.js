require('dotenv').config();
const db = require('../config/db');
const { IMG, VIDEO } = require('./images');

async function seedDemo() {
  const force = process.argv.includes('--force');

  if (force) {
    console.log('Force mode: clearing demo content...');
    await db.query('DELETE FROM gallery');
    await db.query('DELETE FROM testimonials');
    await db.query('DELETE FROM achievements');
    await db.query('DELETE FROM announcements');
    await db.query('DELETE FROM events');
    await db.query('DELETE FROM courses');
    await db.query('DELETE FROM faculty');
  } else {
    const { rows } = await db.query('SELECT COUNT(*)::int AS c FROM courses WHERE deleted_at IS NULL');
    if (rows[0].c > 0) {
      console.log('Demo data already exists — use npm run seed:demo -- --force to re-seed');
      return;
    }
  }

  console.log('Seeding demo content with images & videos...');

  await db.query(
    `INSERT INTO settings (key, value, category) VALUES ($1, $2, 'cms'), ($3, $4, 'cms')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [
      'home_page', JSON.stringify({
        hero_title: "Shape Tomorrow's Leaders at Smart International School",
        hero_subtitle: 'World-class academics, smart classrooms, and 24/7 AI support.',
        video_url: VIDEO,
        video_thumbnail: IMG.videoThumb,
        hero_image: IMG.hero,
      }),
      'about_page', JSON.stringify({
        history: 'Founded in 2001, Smart International School has grown into a premier institution serving 2,500+ students.',
        vision: 'To be a global leader in smart education.',
        mission: 'Deliver quality education through innovation and AI-enabled learning.',
        principal_name: 'Dr. S. Venkatesh',
        principal_message: 'We believe every child is unique and deserves world-class education.',
        infrastructure: [
          { title: 'Smart Classrooms', desc: 'Interactive panels and digital tools.', image: IMG.classroom },
          { title: 'Science Labs', desc: 'Physics, chemistry, and biology labs.', image: IMG.lab },
          { title: 'Digital Library', desc: '10,000+ books and e-resources.', image: IMG.library },
          { title: 'Sports Complex', desc: 'Cricket, basketball, swimming.', image: IMG.sports },
        ],
      }),
    ]
  );

  const courses = [
    {
      title: 'Primary (Classes I-V)', slug: 'primary-i-v',
      desc: 'Foundation learning with activity-based curriculum for young learners.',
      cls: 'Primary', dur: '5 years', fee: '45000', img: IMG.course,
      subjects: ['English', 'Mathematics', 'Environmental Science', 'Telugu', 'Hindi'],
      features: ['Activity-based learning', 'Smart classrooms', 'Weekly assessments', 'Creative arts & sports', 'Safe campus transport'],
      eligibility: 'Age 5+ with basic readiness assessment. Birth certificate required.',
    },
    {
      title: 'Middle School (VI-VIII)', slug: 'middle-vi-viii',
      desc: 'STEM-focused middle school program with smart labs and digital learning.',
      cls: 'Middle', dur: '3 years', fee: '55000', img: IMG.classroom,
      subjects: ['English', 'Mathematics', 'Science', 'Social Studies', 'Computer Basics'],
      features: ['STEM smart labs', 'Digital learning panels', 'Science exhibitions', 'Leadership programs', 'Sports & clubs'],
      eligibility: 'Completion of Primary education or equivalent transfer certificate.',
    },
    {
      title: 'Secondary (IX-X)', slug: 'secondary-ix-x',
      desc: 'Board exam preparation with expert faculty and structured revision plans.',
      cls: 'Secondary', dur: '2 years', fee: '65000', img: IMG.lab,
      subjects: ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Studies'],
      features: ['Board exam coaching', 'Mock tests & analysis', 'Doubt-clearing sessions', 'Career counselling', 'Library & lab access'],
      eligibility: 'Pass in Class VIII from recognized school. Entrance assessment may apply.',
    },
    {
      title: 'Senior Secondary (XI-XII)', slug: 'senior-xi-xii',
      desc: 'Science, Commerce & Humanities streams with college readiness support.',
      cls: 'Senior', dur: '2 years', fee: '75000', img: IMG.campus,
      subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Economics', 'Accountancy'],
      features: ['Multiple stream options', 'JEE/NEET foundation', 'Commerce & CA foundation', 'University placement guidance', 'Advanced labs'],
      eligibility: 'SSC pass with minimum 60% aggregate. Stream selection based on marks.',
    },
  ];
  for (const c of courses) {
    await db.query(
      `INSERT INTO courses (title, slug, description, class_level, duration, fee_structure, image_url, is_featured, subjects, features, eligibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10)`,
      [c.title, c.slug, c.desc, c.cls, c.dur, JSON.stringify({ annual: `₹${c.fee}/yr` }), c.img,
        JSON.stringify(c.subjects), JSON.stringify(c.features), c.eligibility]
    );
  }

  const faculty = [
    ['Dr. S. Venkatesh', 'principal', 'Principal', 'Administration', 'Ph.D. Education', '20+ years', IMG.f1],
    ['Mrs. Lakshmi Devi', 'lakshmi-devi', 'HOD Mathematics', 'Mathematics', 'M.Sc, B.Ed', '15 years', IMG.f2],
    ['Mr. Rajesh Kumar', 'rajesh-kumar', 'Senior Teacher', 'Science', 'M.Sc Physics', '12 years', IMG.f3],
    ['Ms. Anjali Patel', 'anjali-patel', 'Senior Teacher', 'English', 'M.A, TESOL', '10 years', IMG.f4],
    ['Mr. Kiran Rao', 'kiran-rao', 'Teacher', 'Computer Science', 'B.Tech, M.Ed', '8 years', IMG.f5],
    ['Mrs. Padma Reddy', 'padma-reddy', 'Teacher', 'Telugu', 'M.A Telugu', '14 years', IMG.f6],
  ];
  for (const [name, slug, desig, dept, qual, exp, img] of faculty) {
    await db.query(
      `INSERT INTO faculty (name, slug, designation, department, qualification, experience, image_url, is_featured, bio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)`,
      [name, slug, desig, dept, qual, exp, img, `${name} is a dedicated educator at Smart International School.`]
    );
  }

  const gallery = [
    ['Smart Classroom', IMG.classroom, 'image', 'Classroom'],
    ['Science Laboratory', IMG.lab, 'image', 'Labs'],
    ['Campus Aerial View', IMG.campus, 'image', 'Campus'],
    ['Annual Day Event', IMG.event, 'image', 'Events'],
    ['Sports Day', IMG.sports, 'image', 'Sports'],
    ['Library Reading Hall', IMG.library, 'image', 'Campus'],
    ['Campus Tour Video', VIDEO, 'video', 'Videos'],
    ['Graduation Ceremony', IMG.achieve, 'image', 'Events'],
  ];
  for (const [title, url, type, cat] of gallery) {
    await db.query(
      `INSERT INTO gallery (title, media_url, media_type, category, is_featured) VALUES ($1,$2,$3,$4,TRUE)`,
      [title, url, type, cat]
    );
  }

  const testimonials = [
    ['Priya Sharma', 'Parent', 'The AI chatbot answered all our admission queries instantly. Excellent school!', 5, IMG.t1],
    ['Rahul Reddy', 'Class XII Student', 'Smart classrooms make learning engaging. Proud to be part of this institution.', 5, IMG.t2],
    ['Dr. Anitha Rao', 'Alumni Parent', 'Both my children excelled here with outstanding board results.', 5, IMG.t3],
  ];
  for (const [name, role, content, rating, img] of testimonials) {
    await db.query(
      `INSERT INTO testimonials (name, role, content, rating, image_url, is_featured) VALUES ($1,$2,$3,$4,$5,TRUE)`,
      [name, role, content, rating, img]
    );
  }

  const topperImages = [IMG.gallery1, IMG.gallery2, IMG.gallery3, IMG.gallery4, IMG.gallery5, IMG.gallery6, IMG.f1, IMG.f2, IMG.f3, IMG.f4, IMG.f5, IMG.f6];
  const names2024 = [
    'A. Rahul Kumar', 'P. Sneha Reddy', 'K. Arjun', 'M. Divya', 'S. Vikram',
    'R. Ananya', 'N. Karthik', 'L. Priya', 'V. Sandeep', 'T. Meera',
    'G. Rohit', 'H. Keerthi', 'B. Manoj', 'C. Swathi', 'D. Naresh',
    'E. Lakshmi', 'F. Prasad', 'I. Revathi', 'J. Harish', 'O. Suma',
    'Q. Ajay', 'U. Deepa', 'W. Srinivas', 'X. Pooja',
  ];

  for (let i = 0; i < names2024.length; i++) {
    const order = i + 1;
    const name = names2024[i];
    await db.query(
      `INSERT INTO achievements (title, description, category, student_name, rank, rank_order, entry_type, year, image_url, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
      [
        `SSC Topper Rank ${order}`,
        `${name} secured School Rank ${order} in SSC 2024 results`,
        'academic',
        name,
        `School Rank ${order}`,
        order,
        'topper',
        2024,
        topperImages[i % topperImages.length],
      ]
    );
  }

  const achievements = [
    ['100% SSC Pass Rate', 'All students passed with distinction level performance', 'academic', null, null, 0, 'award', 2025, IMG.achieve],
    ['State Rank #3 Science', 'Sneha Reddy secured State Rank 3 in Science stream', 'academic', 'A. Sneha', 'State Rank 3', 1, 'topper', 2025, IMG.gallery2],
    ['School Rank #2 Commerce', 'Outstanding commerce stream performance', 'academic', 'R. Kavya', 'School Rank 2', 2, 'topper', 2025, IMG.gallery3],
    ['School Rank #3 Science', 'Excellent science stream results', 'academic', 'M. Arjun', 'School Rank 3', 3, 'topper', 2025, IMG.gallery4],
    ['National Robotics Champion', 'School robotics team won national championship', 'competition', 'Team Alpha', '1st Place', 0, 'award', 2024, IMG.lab],
    ['Green School Award', 'Recognized for eco-friendly campus initiatives', 'award', null, null, 0, 'award', 2024, IMG.campus],
  ];
  for (const [title, desc, cat, student, rank, rankOrder, entryType, year, img] of achievements) {
    await db.query(
      `INSERT INTO achievements (title, description, category, student_name, rank, rank_order, entry_type, year, image_url, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)`,
      [title, desc, cat, student, rank, rankOrder, entryType, year, img]
    );
  }

  const announcements = [
    ['Admissions Open 2026-27 — Apply Now!', 'Online and offline applications accepted.', 'admission', true],
    ['Annual Day Celebration on June 15th', 'Parents are invited to attend the ceremony.', 'event', true],
    ['Smart Classroom Initiative Launched', 'All classrooms now equipped with digital panels.', 'news', false],
  ];
  for (const [title, content, type, pinned] of announcements) {
    await db.query(
      `INSERT INTO announcements (title, content, type, is_pinned, is_active) VALUES ($1,$2,$3,$4,TRUE)`,
      [title, content, type, pinned]
    );
  }

  const events = [
    {
      title: 'Annual Day Celebration', slug: 'annual-day-2026',
      desc: 'Cultural performances and awards ceremony for students and parents.',
      details: 'Join us for our grand Annual Day celebration featuring dance, music, drama, and award presentations. Parents and guests are warmly invited to witness the talents of our students and celebrate another year of excellence.',
      highlights: ['Cultural performances', 'Student awards', 'Chief guest address', 'Photo exhibition'],
      loc: 'Main Auditorium', date: '2026-06-15', end: '2026-06-15', img: IMG.event,
    },
    {
      title: 'Science Exhibition', slug: 'science-exhibition-2026',
      desc: 'Student innovation showcase with working models and experiments.',
      details: 'Our annual Science Exhibition highlights innovative projects from students across all grades. Explore working models, live experiments, and STEM demonstrations guided by our science faculty.',
      highlights: ['Working science models', 'Live experiments', 'STEM quiz', 'Open to parents'],
      loc: 'Science Block', date: '2026-07-20', end: '2026-07-21', img: IMG.lab,
    },
    {
      title: 'Sports Meet', slug: 'sports-meet-2026',
      desc: 'Inter-house athletics competition and team sports events.',
      details: 'The Inter-House Sports Meet brings together students for track events, team games, and house spirit competitions. Medals and trophies will be awarded to outstanding performers.',
      highlights: ['Track & field events', 'Inter-house competition', 'Medal ceremony', 'House spirit rally'],
      loc: 'Sports Complex', date: '2026-08-10', end: '2026-08-11', img: IMG.sports,
    },
    {
      title: 'Parent-Teacher Meeting', slug: 'ptm-2026',
      desc: 'Academic progress review and one-on-one consultations.',
      details: 'Parents are invited to meet class teachers and subject faculty to discuss academic progress, attendance, and areas for improvement. Appointment slots will be shared in advance.',
      highlights: ['One-on-one consultations', 'Progress reports', 'Goal setting', 'Q&A with faculty'],
      loc: 'Classrooms', date: '2026-09-05', end: null, img: IMG.classroom,
    },
  ];
  for (const e of events) {
    await db.query(
      `INSERT INTO events (title, slug, description, details, highlights, location, event_date, end_date, image_url, is_featured, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE)`,
      [e.title, e.slug, e.desc, e.details, JSON.stringify(e.highlights), e.loc, e.date, e.end, e.img]
    );
  }

  console.log('Demo content seeded successfully!');
}

seedDemo()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
