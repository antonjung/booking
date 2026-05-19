import './database'; // ensure DB is initialized
import db from './database';
import bcrypt from 'bcryptjs';

export function seed(): void {
  // Create admin user if not exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const password_hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, name, role, contact_preference)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin@villagehall.local', password_hash, 'Administrator', 'admin', 'both');
    console.log('[Seed] Created admin user (admin / admin123)');
  }

  // Create sample controller if not exists
  const existingController = db.prepare('SELECT id FROM users WHERE username = ?').get('controller');
  if (!existingController) {
    const password_hash = bcrypt.hashSync('controller123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, name, role, contact_preference)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('controller', 'controller@villagehall.local', password_hash, 'Hall Controller', 'controller', 'both');
    console.log('[Seed] Created controller user (controller / controller123)');
  }

  // Create sample booker if not exists
  const existingBooker = db.prepare('SELECT id FROM users WHERE username = ?').get('booker');
  if (!existingBooker) {
    const password_hash = bcrypt.hashSync('booker123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, name, organisation, role, contact_preference)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('booker', 'booker@example.local', password_hash, 'Sample Booker', 'Local Community Group', 'booker', 'both');
    console.log('[Seed] Created booker user (booker / booker123)');
  }

  // Create facilities if none exist
  const facilityCount = (db.prepare('SELECT COUNT(*) as count FROM facilities').get() as { count: number }).count;
  if (facilityCount === 0) {
    const facilities = [
      { name: 'Main Hall', description: 'The entire village hall — booking this requires all rooms to be available', type: 'room', capacity: 200, is_whole_hall: 1 },
      { name: 'Meeting Room', description: 'Small meeting room suitable for up to 20 people', type: 'room', capacity: 20, is_whole_hall: 0 },
      { name: 'Kitchen', description: 'Fully equipped kitchen with catering facilities', type: 'room', capacity: null, is_whole_hall: 0 },
      { name: 'Committee Room', description: 'Quiet room for committee meetings, up to 12 people', type: 'room', capacity: 12, is_whole_hall: 0 },
      { name: 'Projector & Screen', description: 'HD projector with pull-down screen', type: 'equipment', capacity: null, is_whole_hall: 0 },
      { name: 'PA System', description: 'Professional PA system with microphones', type: 'equipment', capacity: null, is_whole_hall: 0 },
      { name: 'Bar Staff', description: 'Licensed bar staff for events', type: 'service', capacity: null, is_whole_hall: 0 },
      { name: 'Caretaker', description: 'Caretaker to open/close the hall', type: 'service', capacity: null, is_whole_hall: 0 },
    ];

    for (const f of facilities) {
      db.prepare(`
        INSERT INTO facilities (name, description, type, capacity, is_whole_hall)
        VALUES (?, ?, ?, ?, ?)
      `).run(f.name, f.description, f.type, f.capacity, f.is_whole_hall);
    }
    console.log(`[Seed] Created ${facilities.length} sample facilities`);
  }
}

// Run if called directly
if (require.main === module) {
  seed();
  console.log('[Seed] Complete');
  process.exit(0);
}
