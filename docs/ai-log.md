# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 5

### Prompt 1: Move to SQLite and reproduce overselling
- **What I asked:** Create `src/db/schema.sql` and `src/db/connection.js` with tables for users, events, ticket_tiers, and bookings with constraints (`CHECK (sold >= 0 AND sold <= capacity)`), `src/repositories/sqlite.js` matching `memory.js` methods with parameterized queries, `scripts/seed.js`, and `scripts/oversell-demo.js` firing 50 simultaneous booking requests at 1 remaining seat to reproduce overselling.
- **What came back:** Full SQLite database setup using built-in `node:sqlite`, schema migrations, seeded sample data script, and demonstration script reproducing 50 simultaneous bookings succeeding for 1 available seat.
- **What was wrong (or "nothing"):** Ensure database directory is automatically created if it does not exist before connecting, and ensure foreign keys and WAL mode are enabled on every connection via `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`.

### Prompt 2: Database atomic reservation fix
- **What I asked:** Fix the overselling problem in the database using an atomic statement (`UPDATE ticket_tiers SET sold = sold + ? WHERE id = ? AND sold + ? <= capacity`) checking changed rows to throw `SOLD_OUT`, explain why lock variables and checking twice fail, add `test/oversell.test.js` verifying 1 success and 49 `SOLD_OUT` plus a negative test proving failure if the fix is removed, and update the demo script to show numbers before and after.
- **What came back:** Atomic reservation statement implemented in `sqlite.js` and wired to `bookingService.js`, `test/oversell.test.js` verifying 50 simultaneous requests result in exactly 1 booking and 49 `SOLD_OUT` plus data persistence across restart, and dual-mode oversell demo script.
- **What was wrong (or "nothing"):** Make sure seat release on cancellation also protects the lower bound (`sold = MAX(0, sold - ?)`) so concurrent cancellations cannot violate check constraints.

## Build 4

### Prompt 1: Build 4 REST API (in memory)
- **What I asked:** Implement in-memory data repositories (`memory.js`), domain services (`eventService.js`, `bookingService.js`), mock payment gateway (`mockPaymentGateway.js`), REST routes with `x-user-id` header authentication and uniform error response format, API examples in `docs/api-examples.md`, and integration tests in `test/api.test.js`.
- **What came back:** Full working REST API with decoupled repository and services, simulation of mock card payment and declines without storing card numbers, comprehensive curl examples in `docs/api-examples.md`, and 8 end-to-end API tests.
- **What was wrong (or "nothing"):** Ensure `src/server.js` only listens on port 3000 when executed as CLI entry point rather than when imported by test suites to prevent dangling open ports; ensure static public directory resolution uses `import.meta.url` rather than `process.cwd()` to run reliably regardless of invocation directory.

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Create `docs/architecture.md` with three Mermaid diagrams (layers, data model, booking life cycle) and layer rules, `bookingStateMachine.js` with allowed and terminal transitions and `INVALID_TRANSITION` error code, a tiny router (`router.js`), an HTTP server (`app.js`, `server.js`, `config.js`) answering `GET /health`, serving `public/` files with path escape protection, uniform error shape `{"error":{"code","message"}}`, and test suite in `node:test`.
- **What came back:** Architecture document with 3 valid Mermaid diagrams, state machine implementation with invariant validation, HTTP router with parameter parsing, node:http server with static file containment and uniform error handling, and test suite covering all transitions, routing, and real HTTP calls.
- **What was wrong (or "nothing"):** Ensure that path traversal attempts with encoded or dot-dot characters are strictly contained within `public/` using `path.resolve` boundary verification, and ensure stack traces never leak in 500 error responses.

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
