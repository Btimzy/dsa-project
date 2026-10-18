# Milestones: Nine Builds

Each Build is one weekly session, and each one ends with something you can run and show. A Build starts from the finished state of the one before it, so keep your `main` branch working.

| Build | Week | Milestone |
|---|---|---|
| 1 | 4 | Domain core in the terminal |
| 2 | 5 | Event search, sorting, backlog, first tests |
| 3 | 6 | Architecture, state machine, server skeleton |
| 4 | 7 | Working REST API (in memory) |
| 5 | 8 | SQLite and the overselling fix |
| 6 | 9 | Frontend on mock data |
| 7 | 10 | Login, roles and a connected app |
| 8 | 11 | Refunds, waitlist, expiry, real test suite |
| 9 | 12 | QR check-in, CI, security, demo-ready |

---

## Build 1: Domain core in the terminal

**You deliver:** events, ticket tiers, bookings with a capacity rule, a first-in-first-out waitlist, and fast lookup of a booking by its reference code. It runs in the terminal. No server, no database.

**You practise:** functions and objects, `Map`, a queue built as a linked list, Big O, errors, Git.

**Done when**
- `npm run demo` prints the whole story: an event sells out, a booking is refused, people join the waitlist, a booking is cancelled, and the next person in line is named.
- `npm run benchmark` shows a `Map` lookup far faster than `Array.find`, and you can explain why in Big O terms.
- Your first pull request is merged.
