// Database seeding script.
// Populates SQLite with initial users, events, and ticket tiers.
// Data persists in SQLite across server restarts.

import { createDatabaseConnection } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createEventService } from '../src/services/eventService.js';
import { newId } from '../src/domain/ids.js';

export async function seedDatabase(db) {
  const connection = db || createDatabaseConnection();
  const repo = createSqliteRepository(connection);
  const eventService = createEventService(repo);

  // 1. Seed users
  const users = [
    { id: 'org_001', email: 'organizer@lagostech.com', role: 'organizer', createdAt: new Date().toISOString() },
    { id: 'att_001', email: 'attendee.ada@gmail.com', role: 'attendee', createdAt: new Date().toISOString() },
    { id: 'att_002', email: 'attendee.bayo@gmail.com', role: 'attendee', createdAt: new Date().toISOString() },
    { id: 'staff_001', email: 'staff.door@lagostech.com', role: 'staff', createdAt: new Date().toISOString() },
  ];

  const insertUserStmt = connection.prepare(`
    INSERT OR IGNORE INTO users (id, email, role, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const user of users) {
    insertUserStmt.run(user.id, user.email, user.role, null, user.createdAt);
  }

  // 2. Check if events already exist
  const existingEvents = await repo.listEvents();
  if (existingEvents.length > 0) {
    console.log(`Database already seeded with ${existingEvents.length} events.`);
    return { eventCount: existingEvents.length };
  }

  // 3. Seed Event 1: Lagos Tech Fest
  const evt1 = await eventService.createEvent('org_001', {
    title: 'Lagos Tech Fest 2026',
    city: 'Lagos',
    venue: 'Landmark Centre, Victoria Island',
    startsAt: '2026-11-20T18:00:00Z',
  });
  await eventService.addTier('org_001', evt1.id, {
    name: 'General Admission',
    priceCents: 500_000,
    capacity: 100,
  });
  await eventService.addTier('org_001', evt1.id, {
    name: 'VIP Pass',
    priceCents: 1_500_000,
    capacity: 25,
  });
  await eventService.publishEvent('org_001', evt1.id);

  // 4. Seed Event 2: Abuja Jazz Night
  const evt2 = await eventService.createEvent('org_001', {
    title: 'Abuja Jazz Night',
    city: 'Abuja',
    venue: 'Transcorp Hilton Congress Hall',
    startsAt: '2026-12-05T19:00:00Z',
  });
  await eventService.addTier('org_001', evt2.id, {
    name: 'Standard Ticket',
    priceCents: 750_000,
    capacity: 50,
  });
  await eventService.publishEvent('org_001', evt2.id);

  console.log('Database seeded successfully:');
  console.log(`- 4 users seeded (organizer, attendees, staff)`);
  console.log(`- 2 events published with ticket tiers`);

  return { eventCount: 2 };
}

// Run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase().catch((err) => {
    console.error('Failed to seed database:', err);
    process.exit(1);
  });
}
