const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@smartschool.edu';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rows.length > 0) {
    console.log('Admin user already exists:', adminEmail);
    return;
  }

  const roleResult = await db.query("SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1");
  const roleId = roleResult.rows[0]?.id;
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db.query(
    `INSERT INTO users (role_id, name, email, password_hash) VALUES ($1, $2, $3, $4)`,
    [roleId, 'Super Admin', adminEmail, passwordHash]
  );

  console.log('Admin seeded successfully');
  console.log('Email:', adminEmail);
  console.log('Password:', adminPassword);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
