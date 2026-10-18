# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:** Implement `sorting.js` with a custom stable `mergeSort` (without `Array.prototype.sort`), `publishEvent`, `unpublishEvent`, and `listEventSummaries` in `inventory.js`, pure functions (`filterEvents`, `sortEvents`, `searchEvents`) in `eventSearch.js`, automated tests for S02, S03, S04, S05, S06 with `node:test`, and `npm test` script in `package.json`.
- **What came back:** All domain modules and pure search/sort functions were implemented alongside 27 passing automated tests covering all acceptance criteria, error codes, merge sort stability, and immutability.
- **What was wrong (or "nothing"):** Ensure date-only boundary parsing for "to" parameters extends through the end of the specified day (`23:59:59.999Z`) so evening events on that date are matched; ensure merge sort uses `<= 0` to preserve strict stability for equal items.

## Build 1

### Prompt 1: Build 1 domain core (terminal)
- **What I asked:** Implement the initial domain core: `errors.js` (`DomainError`), `ids.js` (`newId`, `newReference` using `node:crypto`), `waitlistQueue.js` (O(1) FIFO Queue using a linked list with private fields), `inventory.js` (in-memory ticket store, event creation, tier creation, booking rules with capacity enforcement, cancellation, O(1) reference lookup, waitlist), `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What came back:** Full ES module implementation across all specified domain files, demo script, benchmark script, and package.json scripts (`demo` and `benchmark`).
- **What was wrong (or "nothing"):** Ensure strict input validation for text fields and safe integer arithmetic for cent amounts; ensure booking data validation occurs before modifying tier inventory so failed bookings never mutate state; ensure `referenceCode` generates unbiased characters using a 32-character alphabet dividing 256.
