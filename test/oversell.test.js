import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabaseConnection } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';

test('S08 - Atomic Overselling Fix: exactly 1 booking succeeds when 50 simultaneous requests compete for 1 seat', async () => {
  const db = createDatabaseConnection(':memory:');
  const repo = createSqliteRepository(db);
  const paymentGateway = createMockPaymentGateway();
  const eventService = createEventService(repo);
  const bookingService = createBookingService(repo, paymentGateway);

  // 1. Create and publish event with a tier having capacity = 1
  const event = await eventService.createEvent('org_test', {
    title: 'Flash Sale Concert',
    city: 'Lagos',
    venue: 'Landmark',
    startsAt: '2026-12-15T20:00:00Z',
  });
  const tier = await eventService.addTier('org_test', event.id, {
    name: 'Last Ticket Tier',
    priceCents: 500_000,
    capacity: 1,
  });
  await eventService.publishEvent('org_test', event.id);

  // 2. Fire 50 simultaneous booking requests using Promise.all
  const TOTAL_REQUESTS = 50;
  const results = [];

  const promises = Array.from({ length: TOTAL_REQUESTS }, (_, index) => {
    const userId = `user_${index + 1}`;
    return bookingService.bookTickets(userId, { tierId: tier.id, quantity: 1 })
      .then((booking) => {
        results.push({ status: 'fulfilled', booking });
      })
      .catch((err) => {
        results.push({ status: 'rejected', error: err });
      });
  });

  await Promise.all(promises);

  // 3. Verify exactly 1 succeeded and 49 were rejected with SOLD_OUT
  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');

  assert.equal(successes.length, 1, 'Expected exactly 1 booking to succeed');
  assert.equal(failures.length, 49, 'Expected exactly 49 bookings to be rejected');

  for (const failure of failures) {
    assert.equal(failure.error.code, 'SOLD_OUT', 'Expected error code to be SOLD_OUT');
  }

  // 4. Verify database state: tier sold is exactly 1, bookings count is 1
  const updatedTier = await repo.findTierById(tier.id);
  assert.equal(updatedTier.sold, 1, 'Tier sold count must not exceed capacity');

  const bookingCount = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE tier_id = ?').get(tier.id);
  assert.equal(bookingCount.count, 1, 'Database must contain exactly 1 booking record');
});

test('S08 - Proves failure when the atomic fix is removed (negative test)', async () => {
  const db = createDatabaseConnection(':memory:');
  const repo = createSqliteRepository(db);
  const paymentGateway = createMockPaymentGateway();
  const eventService = createEventService(repo);
  const bookingService = createBookingService(repo, paymentGateway);

  // Temporarily disable atomic reservation to reproduce the bug
  repo.useAtomicReservation = false;

  const event = await eventService.createEvent('org_test', {
    title: 'Unprotected Concert',
    city: 'Lagos',
    venue: 'Landmark',
    startsAt: '2026-12-15T20:00:00Z',
  });
  const tier = await eventService.addTier('org_test', event.id, {
    name: 'Unprotected Seat',
    priceCents: 500_000,
    capacity: 1,
  });
  await eventService.publishEvent('org_test', event.id);

  const TOTAL_REQUESTS = 50;
  const results = [];

  const promises = Array.from({ length: TOTAL_REQUESTS }, (_, index) => {
    const userId = `user_${index + 1}`;
    return bookingService.bookTickets(userId, { tierId: tier.id, quantity: 1 })
      .then((booking) => {
        results.push({ status: 'fulfilled', booking });
      })
      .catch((err) => {
        results.push({ status: 'rejected', error: err });
      });
  });

  await Promise.all(promises);

  const successes = results.filter((r) => r.status === 'fulfilled');
  const dbBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE tier_id = ?').get(tier.id);

  // Proves that WITHOUT the atomic fix, multiple bookings succeed (overselling happens)
  assert.ok(
    successes.length > 1,
    `Without atomic fix, multiple bookings must succeed to reproduce overselling (got ${successes.length})`
  );
  assert.ok(
    dbBookings.count > 1,
    `Without atomic fix, database must contain multiple bookings for 1 seat (got ${dbBookings.count})`
  );
});

test('Build 5 - Data persistence: database survives restart and keeps data', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticketing-db-test-'));
  const testDbFile = path.join(tempDir, 'test_persistence.db');

  try {
    // 1. Initial connection: create and seed data
    const db1 = createDatabaseConnection(testDbFile);
    const repo1 = createSqliteRepository(db1);
    const eventService1 = createEventService(repo1);

    const event = await eventService1.createEvent('org_persist', {
      title: 'Persistent Event',
      city: 'Enugu',
      venue: 'Polo Park',
      startsAt: '2027-01-10T15:00:00Z',
    });
    const tier = await eventService1.addTier('org_persist', event.id, {
      name: 'Regular',
      priceCents: 250_000,
      capacity: 50,
    });
    await eventService1.publishEvent('org_persist', event.id);

    // Close connection simulating server shutdown
    db1.close();

    // 2. Second connection simulating server restart
    const db2 = createDatabaseConnection(testDbFile);
    const repo2 = createSqliteRepository(db2);

    const reloadedEvent = await repo2.findEventById(event.id);
    assert.ok(reloadedEvent, 'Event must exist after database reopen');
    assert.equal(reloadedEvent.title, 'Persistent Event');
    assert.equal(reloadedEvent.status, 'published');

    const reloadedTier = await repo2.findTierById(tier.id);
    assert.ok(reloadedTier, 'Tier must exist after database reopen');
    assert.equal(reloadedTier.capacity, 50);

    db2.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
