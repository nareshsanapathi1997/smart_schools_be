require('dotenv').config();
const db = require('../config/db');
const { IMG, VIDEO } = require('./images');

async function updateImages() {
  console.log('Updating demo images to subtle education-themed photos...');

  await db.query(
    `UPDATE settings SET value = $1 WHERE key = 'home_page'`,
    [JSON.stringify({
      hero_title: "Shape Tomorrow's Leaders at Smart International School",
      hero_subtitle: 'World-class academics, smart classrooms, and 24/7 AI support.',
      video_url: VIDEO,
      video_thumbnail: IMG.videoThumb,
      hero_image: IMG.hero,
    })]
  );

  await db.query(
    `UPDATE settings SET value = $1 WHERE key = 'about_page'`,
    [JSON.stringify({
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
    })]
  );

  const courseImages = [IMG.course, IMG.classroom, IMG.lab, IMG.campus];
  const { rows: courses } = await db.query(
    'SELECT id FROM courses WHERE deleted_at IS NULL ORDER BY created_at'
  );
  for (let i = 0; i < courses.length; i++) {
    await db.query('UPDATE courses SET image_url = $1 WHERE id = $2', [
      courseImages[i % courseImages.length],
      courses[i].id,
    ]);
  }

  const facultyImages = [IMG.f1, IMG.f2, IMG.f3, IMG.f4, IMG.f5, IMG.f6];
  const { rows: faculty } = await db.query(
    'SELECT id FROM faculty WHERE deleted_at IS NULL ORDER BY created_at'
  );
  for (let i = 0; i < faculty.length; i++) {
    await db.query('UPDATE faculty SET image_url = $1 WHERE id = $2', [
      facultyImages[i % facultyImages.length],
      faculty[i].id,
    ]);
  }

  const testimonialImages = [IMG.t1, IMG.t2, IMG.t3];
  const { rows: testimonials } = await db.query(
    'SELECT id FROM testimonials WHERE deleted_at IS NULL ORDER BY created_at'
  );
  for (let i = 0; i < testimonials.length; i++) {
    await db.query('UPDATE testimonials SET image_url = $1 WHERE id = $2', [
      testimonialImages[i % testimonialImages.length],
      testimonials[i].id,
    ]);
  }

  const achievementImages = [IMG.achieve, IMG.gallery2, IMG.lab, IMG.campus];
  const { rows: achievements } = await db.query(
    'SELECT id FROM achievements WHERE deleted_at IS NULL ORDER BY created_at'
  );
  for (let i = 0; i < achievements.length; i++) {
    await db.query('UPDATE achievements SET image_url = $1 WHERE id = $2', [
      achievementImages[i % achievementImages.length],
      achievements[i].id,
    ]);
  }

  const eventImages = [IMG.event, IMG.lab, IMG.sports, IMG.classroom];
  const { rows: events } = await db.query(
    'SELECT id FROM events WHERE deleted_at IS NULL ORDER BY event_date'
  );
  for (let i = 0; i < events.length; i++) {
    await db.query('UPDATE events SET image_url = $1 WHERE id = $2', [
      eventImages[i % eventImages.length],
      events[i].id,
    ]);
  }

  const galleryItems = [
    ['Smart Classroom', IMG.classroom, 'image'],
    ['Science Laboratory', IMG.lab, 'image'],
    ['Campus View', IMG.campus, 'image'],
    ['Annual Day Event', IMG.event, 'image'],
    ['Sports Day', IMG.sports, 'image'],
    ['Library Hall', IMG.library, 'image'],
    ['Campus Tour Video', VIDEO, 'video'],
    ['Graduation Ceremony', IMG.achieve, 'image'],
  ];
  const { rows: gallery } = await db.query(
    'SELECT id FROM gallery WHERE deleted_at IS NULL ORDER BY created_at'
  );
  for (let i = 0; i < gallery.length; i++) {
    const item = galleryItems[i % galleryItems.length];
    await db.query('UPDATE gallery SET media_url = $1, media_type = $2 WHERE id = $3', [
      item[1],
      item[2],
      gallery[i].id,
    ]);
  }

  console.log('Images updated successfully!');
}

updateImages()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
