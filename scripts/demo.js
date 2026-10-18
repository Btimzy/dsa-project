import {
  createStore,
  createEvent,
  addTier,
  seatsLeft,
  bookTickets,
  cancelBooking,
  findBookingByReference,
  joinWaitlist,
  offerNextOnWaitlist,
} from '../src/domain/inventory.js';

const store = createStore();

const event = createEvent(store, {
  organizerId: 'org_001',
  title: 'Lagos Tech Meetup',
  city: 'Lagos',
  venue: 'Landmark Centre',
  startsAt: '2026-11-20T18:00:00Z',
});

const tier = addTier(store, event.id, {
  name: 'General',
  priceCents: 500_000,
  capacity: 3,
});

console.log(`Created "${event.title}" with ${tier.capacity} seats in ${tier.name}.\n`);

// 1. Ada books 2 tickets
const adaBooking = bookTickets(store, tier.id, 'ada', 2);
console.log(`OK    Ada books 2 tickets (Reference: ${adaBooking.reference})`);

// 2. Bayo attempts to book 2 tickets (only 1 left)
try {
  bookTickets(store, tier.id, 'bayo', 2);
  console.log('FAIL  Bayo should not have been allowed to book 2 tickets');
} catch (err) {
  console.log(`FAIL  Bayo books 2 tickets (only ${seatsLeft(tier)} left) -> ${err.code}: ${err.message}`);
}

// 3. Bayo books the last remaining ticket
const bayoBooking = bookTickets(store, tier.id, 'bayo', 1);
console.log(`OK    Bayo books 1 ticket (Reference: ${bayoBooking.reference})`);

console.log(`\nSeats left: ${seatsLeft(tier)}\n`);

// 4. Sold out: Chidi and Dayo join the waitlist
const chidiWait = joinWaitlist(store, tier.id, 'chidi', 2);
console.log(`OK    Chidi joins the waitlist for 2 seats (Position: ${chidiWait.position})`);

const dayoWait = joinWaitlist(store, tier.id, 'dayo', 1);
console.log(`OK    Dayo joins the waitlist for 1 seat (Position: ${dayoWait.position})`);

// 5. Look up Ada's booking by reference code in O(1)
console.log(`\nLooking Ada's booking up by reference ${adaBooking.reference}:`);
const found = findBookingByReference(store, adaBooking.reference);
console.log(found);

// 6. Ada cancels her booking
cancelBooking(store, adaBooking.reference);
console.log(`\nOK    Ada cancels`);
console.log(`Seats left: ${seatsLeft(tier)}`);

// 7. Offer freed seats to the next eligible person on the waitlist (FIFO)
const offered = offerNextOnWaitlist(store, tier.id);
console.log(`Next on the waitlist:`, offered);
