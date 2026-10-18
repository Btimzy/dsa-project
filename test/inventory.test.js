import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore,
  createEvent,
  addTier,
  seatsLeft,
  bookTickets,
  cancelBooking,
  publishEvent,
  unpublishEvent,
  listEventSummaries,
  joinWaitlist,
} from '../src/domain/inventory.js';
import { DomainError } from '../src/domain/errors.js';

test('S02 - create event: saved as draft with new id and not on public list', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Lagos Tech Meetup',
    city: 'Lagos',
    venue: 'Landmark',
    startsAt: '2026-11-20T10:00:00Z',
  });

  assert.ok(event.id);
  assert.equal(event.status, 'draft');
  assert.equal(event.title, 'Lagos Tech Meetup');
  assert.equal(event.city, 'Lagos');

  // Draft event must not appear on the public list
  const publicEvents = listEventSummaries(store, { publishedOnly: true });
  assert.equal(publicEvents.length, 0);
});

test('S02 - create event: rejects missing title, city, or invalid date with VALIDATION error', () => {
  const store = createStore();

  assert.throws(
    () => createEvent(store, { organizerId: 'org-1', title: '', city: 'Lagos', startsAt: '2026-11-20' }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => createEvent(store, { organizerId: 'org-1', title: 'Title', city: '  ', startsAt: '2026-11-20' }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => createEvent(store, { organizerId: 'org-1', title: 'Title', city: 'Lagos', startsAt: 'not-a-date' }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );
});

test('S03 - add ticket tier: saves with 0 sold and correct seats left', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Concert',
    city: 'Abuja',
    startsAt: '2026-12-01T19:00:00Z',
  });

  const tier = addTier(store, event.id, {
    name: 'General',
    priceCents: 500_000,
    capacity: 100,
  });

  assert.ok(tier.id);
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 100);
  assert.equal(tier.priceCents, 500_000);
});

test('S03 - add ticket tier: rejects non-whole price or capacity < 1 with VALIDATION', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Concert',
    city: 'Abuja',
    startsAt: '2026-12-01T19:00:00Z',
  });

  assert.throws(
    () => addTier(store, event.id, { name: 'VIP', priceCents: 150.5, capacity: 50 }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => addTier(store, event.id, { name: 'VIP', priceCents: 1000, capacity: 0 }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => addTier(store, event.id, { name: 'VIP', priceCents: 1000, capacity: -5 }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );
});

test('S03 - add ticket tier: rejects non-existent event ID with NOT_FOUND', () => {
  const store = createStore();
  assert.throws(
    () => addTier(store, 'non-existent-id', { name: 'General', priceCents: 1000, capacity: 10 }),
    (err) => err instanceof DomainError && err.code === 'NOT_FOUND'
  );
});

test('S04 - publish event: event with tiers becomes published and appears on public list', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Tech Summit',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  addTier(store, event.id, { name: 'Standard', priceCents: 2000, capacity: 50 });

  const published = publishEvent(store, event.id);
  assert.equal(published.status, 'published');

  const publicSummaries = listEventSummaries(store, { publishedOnly: true });
  assert.equal(publicSummaries.length, 1);
  assert.equal(publicSummaries[0].id, event.id);
});

test('S04 - publish event: event with no tiers is rejected with INVALID_STATE', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Empty Event',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });

  assert.throws(
    () => publishEvent(store, event.id),
    (err) => err instanceof DomainError && err.code === 'INVALID_STATE'
  );
  assert.equal(event.status, 'draft');
});

test('S04 - unpublish event: event becomes draft and is hidden from public list', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Tech Summit',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  addTier(store, event.id, { name: 'Standard', priceCents: 2000, capacity: 50 });
  publishEvent(store, event.id);

  unpublishEvent(store, event.id);
  assert.equal(event.status, 'draft');

  const publicSummaries = listEventSummaries(store, { publishedOnly: true });
  assert.equal(publicSummaries.length, 0);
});

test('S06 - book tickets: books 2 tickets from 3 left, creates pending booking in whole cents, 1 left', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Show',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500_000, capacity: 3 });

  const booking = bookTickets(store, tier.id, 'user-1', 2);
  assert.equal(booking.quantity, 2);
  assert.equal(booking.amountCents, 1_000_000);
  assert.equal(booking.status, 'pending');
  assert.equal(seatsLeft(tier), 1);
});

test('S06 - book tickets: rejected with SOLD_OUT when booking exceeds remaining seats, changes nothing', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Show',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500_000, capacity: 1 });

  assert.throws(
    () => bookTickets(store, tier.id, 'user-1', 2),
    (err) => err instanceof DomainError && err.code === 'SOLD_OUT'
  );
  assert.equal(tier.sold, 0);
  assert.equal(seatsLeft(tier), 1);
  assert.equal(store.bookings.size, 0);
});

test('S06 - book tickets: quantity 0, negative, fractional, or > 10 rejected with VALIDATION', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Show',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500_000, capacity: 50 });

  for (const invalidQty of [0, -1, 1.5, 11]) {
    assert.throws(
      () => bookTickets(store, tier.id, 'user-1', invalidQty),
      (err) => err instanceof DomainError && err.code === 'VALIDATION',
      `Expected VALIDATION error for quantity ${invalidQty}`
    );
  }
});

test('Domain errors - covers NOT_SOLD_OUT and duplicate cancel INVALID_STATE', () => {
  const store = createStore();
  const event = createEvent(store, {
    organizerId: 'org-1',
    title: 'Show',
    city: 'Lagos',
    startsAt: '2026-11-20T10:00:00Z',
  });
  const tier = addTier(store, event.id, { name: 'General', priceCents: 500_000, capacity: 5 });

  // Joining waitlist when tickets are available throws NOT_SOLD_OUT
  assert.throws(
    () => joinWaitlist(store, tier.id, 'user-1', 1),
    (err) => err instanceof DomainError && err.code === 'NOT_SOLD_OUT'
  );

  const booking = bookTickets(store, tier.id, 'user-1', 1);
  cancelBooking(store, booking.reference);

  // Cancelling twice throws INVALID_STATE
  assert.throws(
    () => cancelBooking(store, booking.reference),
    (err) => err instanceof DomainError && err.code === 'INVALID_STATE'
  );
});
