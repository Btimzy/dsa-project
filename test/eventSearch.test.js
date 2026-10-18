import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents, sortEvents, searchEvents } from '../src/domain/eventSearch.js';
import { DomainError } from '../src/domain/errors.js';

function createSampleSummaries() {
  return [
    {
      id: 'evt-1',
      title: 'Lagos Tech Meetup',
      city: 'Lagos',
      venue: 'Landmark Centre',
      startsAt: '2026-11-20T10:00:00Z',
      minPriceCents: 500_000,
      seatsLeft: 10,
    },
    {
      id: 'evt-2',
      title: 'Abuja Jazz Night',
      city: 'Abuja',
      venue: 'Transcorp Hilton',
      startsAt: '2026-12-05T17:00:00Z',
      minPriceCents: 1_200_000,
      seatsLeft: 0,
    },
    {
      id: 'evt-3',
      title: 'Lagos Art Expo',
      city: 'Lagos',
      venue: 'National Theatre',
      startsAt: '2026-12-05T09:00:00Z',
      minPriceCents: 200_000,
      seatsLeft: 25,
    },
    {
      id: 'evt-4',
      title: 'Free Workshop',
      city: 'Ibadan',
      venue: 'University Hall',
      startsAt: '2026-10-30T14:00:00Z',
      minPriceCents: null, // No tiers / free
      seatsLeft: 50,
    },
  ];
}

test('S05 - search: text search for "JAZZ" returns only Abuja Jazz Night', () => {
  const summaries = createSampleSummaries();
  const results = filterEvents(summaries, { q: 'JAZZ' });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Abuja Jazz Night');
});

test('S05 - search: text search matches venue case-insensitively', () => {
  const summaries = createSampleSummaries();
  const results = filterEvents(summaries, { q: 'landmark' });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Lagos Tech Meetup');
});

test('S05 - filter by city: "lagos" returns only Lagos events regardless of case', () => {
  const summaries = createSampleSummaries();
  const results = filterEvents(summaries, { city: 'lagos' });
  assert.equal(results.length, 2);
  assert.ok(results.every((e) => e.city.toLowerCase() === 'lagos'));
});

test('S05 - max price and sort by price: returns events within maxPrice cheapest first, excludes no-tier events', () => {
  const summaries = createSampleSummaries();
  // Max price 600,000 cents: should include Lagos Art Expo (200k) and Lagos Tech Meetup (500k), exclude Abuja Jazz Night (1.2m) and Free Workshop (null)
  const results = searchEvents(summaries, { maxPriceCents: 600_000 }, 'price');
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Lagos Art Expo');
  assert.equal(results[1].title, 'Lagos Tech Meetup');
});

test('S05 - sort by date: earlier comes first, same day stays in title order', () => {
  const summaries = [
    {
      id: 'evt-b',
      title: 'Zeta Festival',
      startsAt: '2026-12-05T10:00:00Z',
      minPriceCents: 1000,
      seatsLeft: 5,
    },
    {
      id: 'evt-a',
      title: 'Alpha Meetup',
      startsAt: '2026-12-05T10:00:00Z',
      minPriceCents: 1000,
      seatsLeft: 5,
    },
    {
      id: 'evt-c',
      title: 'Beta Conference',
      startsAt: '2026-12-01T09:00:00Z',
      minPriceCents: 1000,
      seatsLeft: 5,
    },
  ];

  const sorted = sortEvents(summaries, 'date');
  assert.equal(sorted[0].title, 'Beta Conference'); // Dec 1
  assert.equal(sorted[1].title, 'Alpha Meetup');     // Dec 5, starts with A
  assert.equal(sorted[2].title, 'Zeta Festival');    // Dec 5, starts with Z
});

test('S05 - date filter: event at 5 PM on 5 December included when filtering up to 2026-12-05', () => {
  const summaries = createSampleSummaries();
  // Event evt-2 is at 2026-12-05T17:00:00Z (5 PM)
  const results = filterEvents(summaries, { to: '2026-12-05' });
  const titles = results.map((e) => e.title);
  assert.ok(titles.includes('Abuja Jazz Night'));
  assert.ok(titles.includes('Lagos Art Expo'));
  assert.ok(titles.includes('Free Workshop'));
});

test('S05 - validation errors: bad date, non-whole price, or unknown sortBy throws VALIDATION', () => {
  const summaries = createSampleSummaries();

  assert.throws(
    () => filterEvents(summaries, { from: 'invalid-date' }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => filterEvents(summaries, { maxPriceCents: 100.5 }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => filterEvents(summaries, { maxPriceCents: -10 }),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );

  assert.throws(
    () => sortEvents(summaries, 'popularity'),
    (err) => err instanceof DomainError && err.code === 'VALIDATION'
  );
});

test('S05 - immutability: original list is unchanged when searched, filtered or sorted', () => {
  const summaries = createSampleSummaries();
  const clone = JSON.parse(JSON.stringify(summaries));

  const filtered = filterEvents(summaries, { city: 'Lagos' });
  assert.deepEqual(summaries, clone);
  assert.notEqual(filtered, summaries);

  const sorted = sortEvents(summaries, 'price');
  assert.deepEqual(summaries, clone);
  assert.notEqual(sorted, summaries);

  const searched = searchEvents(summaries, { q: 'Art' }, 'date');
  assert.deepEqual(summaries, clone);
  assert.notEqual(searched, summaries);
});

test('S05 - empty list: search, filter, and sort handle empty array gracefully', () => {
  assert.deepEqual(filterEvents([], { q: 'test' }), []);
  assert.deepEqual(sortEvents([], 'date'), []);
  assert.deepEqual(searchEvents([], { city: 'Lagos' }, 'availability'), []);
});

test('S05 - sort by availability: most seats left first, tie breaks by title', () => {
  const summaries = [
    { id: '1', title: 'Few Seats', seatsLeft: 2 },
    { id: '2', title: 'Sold Out', seatsLeft: 0 },
    { id: '3', title: 'Many Seats B', seatsLeft: 10 },
    { id: '4', title: 'Many Seats A', seatsLeft: 10 },
  ];

  const sorted = sortEvents(summaries, 'availability');
  assert.equal(sorted[0].title, 'Many Seats A');
  assert.equal(sorted[1].title, 'Many Seats B');
  assert.equal(sorted[2].title, 'Few Seats');
  assert.equal(sorted[3].title, 'Sold Out');
});
