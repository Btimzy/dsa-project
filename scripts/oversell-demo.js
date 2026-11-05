// Demonstration script for the overselling problem (The Last-Ticket Concurrency Problem)
// Demonstrates:
// 1. Before Fix: Non-atomic read-then-write check permits multiple concurrent bookings for the last ticket.
// 2. After Fix: Atomic SQL statement (UPDATE ... WHERE sold + ? <= capacity) guarantees exactly 1 booking succeeds.

import { createDatabaseConnection } from '../src/db/connection.js';
import { createSqliteRepository } from '../src/repositories/sqlite.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';
import { createEventService } from '../src/services/eventService.js';
import { createBookingService } from '../src/services/bookingService.js';

export async function runOversellDemo() {
  console.log('===============================================================');
  console.log('   EVENT TICKETING: OVERSELLING CONCURRENCY DEMONSTRATION');
  console.log('===============================================================\n');

  // Use an in-memory SQLite database for a clean demonstration run
  const db = createDatabaseConnection(':memory:');
  const repo = createSqliteRepository(db);
  const paymentGateway = createMockPaymentGateway();
  const eventService = createEventService(repo);
  const bookingService = createBookingService(repo, paymentGateway);

  const CONCURRENT_REQUESTS = 50;

  // --------------------------------------------------------------------------
  // PART 1: BEFORE THE FIX (Naive Time-Of-Check to Time-Of-Use)
  // --------------------------------------------------------------------------
  console.log('--- PART 1: BEFORE FIX (Naive Check-Then-Update in Application Code) ---');
  repo.useAtomicReservation = false;

  const naiveEvent = await eventService.createEvent('org_demo', {
    title: 'High-Demand Concert (Unprotected)',
    city: 'Lagos',
    venue: 'Eko Hotel',
    startsAt: '2026-12-31T20:00:00Z',
  });
  const naiveTier = await eventService.addTier('org_demo', naiveEvent.id, {
    name: 'Last Seat VIP',
    priceCents: 500_000,
    capacity: 1, // Only 1 seat available!
  });
  await eventService.publishEvent('org_demo', naiveEvent.id);

  console.log(`Event: "${naiveEvent.title}"`);
  console.log(`Tier: "${naiveTier.name}" with capacity = ${naiveTier.capacity}`);
  console.log(`Simulating ${CONCURRENT_REQUESTS} simultaneous attendees clicking "Buy" at the exact same moment...\n`);

  let naiveSuccesses = 0;
  let naiveFailures = 0;

  const naivePromises = [];
  for (let i = 1; i <= CONCURRENT_REQUESTS; i += 1) {
    const userId = `attendee_${String(i).padStart(2, '0')}`;
    const promise = bookingService.bookTickets(userId, {
      tierId: naiveTier.id,
      quantity: 1,
    })
      .then(() => {
        naiveSuccesses += 1;
      })
      .catch(() => {
        naiveFailures += 1;
      });
    naivePromises.push(promise);
  }

  await Promise.all(naivePromises);

  const allNaiveBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE tier_id = ?').get(naiveTier.id);

  console.log('Result Without Atomic Fix:');
  console.log(`- Total requests fired:      ${CONCURRENT_REQUESTS}`);
  console.log(`- Tier capacity:             1`);
  console.log(`- Bookings reported success: ${naiveSuccesses}`);
  console.log(`- Bookings rejected:         ${naiveFailures}`);
  console.log(`- Actual bookings in DB:     ${allNaiveBookings.count}`);
  console.log(`- OVERSELLING STATUS:        ${allNaiveBookings.count > 1 ? 'BUG REPRODUCED (OVERSELLING OCCURRED!)' : 'SAFE'}\n`);

  // --------------------------------------------------------------------------
  // PART 2: AFTER THE FIX (Atomic Database UPDATE ... WHERE sold + ? <= capacity)
  // --------------------------------------------------------------------------
  console.log('--- PART 2: AFTER FIX (Atomic Database Statement) ---');
  repo.useAtomicReservation = true;

  const fixedEvent = await eventService.createEvent('org_demo', {
    title: 'High-Demand Concert (Protected)',
    city: 'Lagos',
    venue: 'Eko Hotel',
    startsAt: '2026-12-31T20:00:00Z',
  });
  const fixedTier = await eventService.addTier('org_demo', fixedEvent.id, {
    name: 'Last Seat VIP Protected',
    priceCents: 500_000,
    capacity: 1, // Only 1 seat available!
  });
  await eventService.publishEvent('org_demo', fixedEvent.id);

  console.log(`Event: "${fixedEvent.title}"`);
  console.log(`Tier: "${fixedTier.name}" with capacity = ${fixedTier.capacity}`);
  console.log(`Simulating ${CONCURRENT_REQUESTS} simultaneous attendees clicking "Buy" at the exact same moment...\n`);

  let fixedSuccesses = 0;
  let fixedFailures = 0;

  const fixedPromises = [];
  for (let i = 1; i <= CONCURRENT_REQUESTS; i += 1) {
    const userId = `attendee_${String(i).padStart(2, '0')}`;
    const promise = bookingService.bookTickets(userId, {
      tierId: fixedTier.id,
      quantity: 1,
    })
      .then(() => {
        fixedSuccesses += 1;
      })
      .catch((err) => {
        if (err.code === 'SOLD_OUT') {
          fixedFailures += 1;
        }
      });
    fixedPromises.push(promise);
  }

  await Promise.all(fixedPromises);

  const updatedFixedTier = await repo.findTierById(fixedTier.id);
  const allFixedBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE tier_id = ?').get(fixedTier.id);

  console.log('Result With Atomic Fix:');
  console.log(`- Total requests fired:      ${CONCURRENT_REQUESTS}`);
  console.log(`- Tier capacity:             1`);
  console.log(`- Bookings succeeded:        ${fixedSuccesses}`);
  console.log(`- Bookings rejected:         ${fixedFailures} (all with SOLD_OUT)`);
  console.log(`- Actual bookings in DB:     ${allFixedBookings.count}`);
  console.log(`- Tier sold count in DB:     ${updatedFixedTier.sold}`);
  console.log(`- OVERSELLING STATUS:        ${fixedSuccesses === 1 && allFixedBookings.count === 1 ? 'PREVENTED (EXACTLY 1 GOT THE TICKET)' : 'FAILED'}\n`);

  console.log('--- WHY LOCK VARIABLES AND CHECKING TWICE DO NOT WORK ---');
  console.log('1. A JavaScript lock variable only exists in the memory of a single Node process/event loop');
  console.log('   and does not prevent race conditions across multiple worker threads, cluster processes,');
  console.log('   or server instances sharing the database.');
  console.log('2. "Checking twice" (Time-of-Check to Time-of-Use) fails because between the moment you check');
  console.log('   the remaining capacity and the moment you write the increment, another concurrent request');
  console.log('   can execute and claim the seat, rendering the check obsolete.\n');
}

if (process.argv[1] && process.argv[1].endsWith('oversell-demo.js')) {
  runOversellDemo().catch((err) => {
    console.error('Oversell demo failed:', err);
    process.exit(1);
  });
}
