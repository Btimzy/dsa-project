# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Build 1 domain core (terminal)
- **What I asked:** Implement the initial domain core: `errors.js` (`DomainError`), `ids.js` (`newId`, `newReference` using `node:crypto`), `waitlistQueue.js` (O(1) FIFO Queue using a linked list with private fields), `inventory.js` (in-memory ticket store, event creation, tier creation, booking rules with capacity enforcement, cancellation, O(1) reference lookup, waitlist), `scripts/demo.js`, and `scripts/benchmark-lookup.js`.
- **What came back:** Full ES module implementation across all specified domain files, demo script, benchmark script, and package.json scripts (`demo` and `benchmark`).
- **What was wrong (or "nothing"):** Ensure strict input validation for text fields and safe integer arithmetic for cent amounts; ensure booking data validation occurs before modifying tier inventory so failed bookings never mutate state; ensure `referenceCode` generates unbiased characters using a 32-character alphabet dividing 256.
