// Benchmark: Map lookup (O(1)) vs Array.find (O(N))
// Demonstrates why reference-code lookup uses a Map instead of linear searching.

import { performance } from 'node:perf_hooks';
import { newReference } from '../src/domain/ids.js';

const BOOKING_COUNT = 100_000;
const LOOKUP_COUNT = 500;

console.log(`Generating ${BOOKING_COUNT.toLocaleString()} bookings in memory...`);

const list = [];
const map = new Map();

for (let i = 0; i < BOOKING_COUNT; i += 1) {
  const reference = newReference();
  const booking = { id: `id-${i}`, reference, index: i };
  list.push(booking);
  map.set(reference, booking);
}

// Select sample references across the entire set to look up
const targetReferences = [];
const step = Math.floor(BOOKING_COUNT / LOOKUP_COUNT);
for (let i = 0; i < LOOKUP_COUNT; i += 1) {
  targetReferences.push(list[i * step].reference);
}

console.log(`Testing ${LOOKUP_COUNT} lookups on ${BOOKING_COUNT.toLocaleString()} items:\n`);

// Benchmark Array.find - O(N)
const arrayStart = performance.now();
for (let i = 0; i < LOOKUP_COUNT; i += 1) {
  const ref = targetReferences[i];
  list.find((b) => b.reference === ref);
}
const arrayDuration = performance.now() - arrayStart;

// Benchmark Map.get - O(1)
const mapStart = performance.now();
for (let i = 0; i < LOOKUP_COUNT; i += 1) {
  const ref = targetReferences[i];
  map.get(ref);
}
const mapDuration = performance.now() - mapStart;

const speedup = (arrayDuration / mapDuration).toFixed(1);

console.log(`Array.find: ${arrayDuration.toFixed(2)} ms for ${LOOKUP_COUNT} lookups (Linear Time O(N))`);
console.log(`Map.get:    ${mapDuration.toFixed(2)} ms for ${LOOKUP_COUNT} lookups (Constant Time O(1))`);
console.log(`\nMap.get is ~${speedup}x faster than Array.find.`);
console.log(`\nBig O explanation:`);
console.log(`- Array.find scans elements sequentially until a match is found. For N elements, it examines N/2 items on average -> O(N).`);
console.log(`- Map.get computes a hash code directly from the key to jump immediately to the memory bucket -> O(1) average.`);
