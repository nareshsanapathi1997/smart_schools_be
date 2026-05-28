const { execSync } = require('child_process');
const path = require('path');

const migrations = [
  'migrateAchievements.js',
  'migrateCourses.js',
  'migrateEvents.js',
  'migrateLeads.js',
  'migrateLookups.js',
  'migrateStudents.js',
  'migrateErp.js',
  'migrateErpAdvanced.js',
  'migrateErpPhase.js',
];

console.log('Running all migrations...\n');

for (const file of migrations) {
  const script = path.join(__dirname, file);
  console.log(`→ ${file}`);
  try {
    execSync(`node "${script}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
  } catch (err) {
    console.error(`Migration failed: ${file}`);
    process.exit(1);
  }
}

console.log('\nAll migrations completed successfully.');
