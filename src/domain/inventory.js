import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { DomainError } from './errors.js';

export const MAX_TICKETS_PER_BOOKING = 10;
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'paid']);

function requireStore(store) {
  if (
    !store ||
    !(store.events instanceof Map) ||
    !(store.tiers instanceof Map) ||
    !(store.bookings instanceof Map) ||
    !(store.bookingsByReference instanceof Map) ||
    !(store.waitlists instanceof Map)
  ) {
    throw new DomainError('VALIDATION', 'A valid inventory store is required');
  }
  return store;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${field} must be an object`);
  }
  return value;
}

function requireWholeNumber(value, field, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

function getTier(store, tierId) {
  requireText(tierId, 'Tier ID');
  const tier = store.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', `Tier ${tierId} not found`);
  return tier;
}

export function createStore() {
  return {
    events: new Map(),
    tiers: new Map(),
    bookings: new Map(),
    bookingsByReference: new Map(),
    waitlists: new Map(),
  };
}

export function createEvent(store, input) {
  requireStore(store);
  const { title, city, venue = '', startsAt, organizerId } = requireObject(input, 'Event');
  const cleanTitle = requireText(title, 'Title');
  const cleanCity = requireText(city, 'City');
  const cleanOrganizerId = requireText(organizerId, 'Organizer ID');

  if (typeof venue !== 'string') {
    throw new DomainError('VALIDATION', 'Venue must be a string');
  }

  if (
    !(
      typeof startsAt === 'string' ||
      (typeof startsAt === 'number' && Number.isFinite(startsAt)) ||
      startsAt instanceof Date
    )
  ) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }

  const date = startsAt instanceof Date ? new Date(startsAt.getTime()) : new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }

  const event = {
    id: newId(),
    organizerId: cleanOrganizerId,
    title: cleanTitle,
    city: cleanCity,
    venue: venue.trim(),
    startsAt: date.toISOString(),
    status: 'draft',
    tierIds: [],
  };

  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, input) {
  requireStore(store);
  requireText(eventId, 'Event ID');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  const { name, priceCents, capacity } = requireObject(input, 'Tier');
  const cleanName = requireText(name, 'Tier name');
  const cleanPrice = requireWholeNumber(priceCents, 'Price (in cents)', 0);
  const cleanCapacity = requireWholeNumber(capacity, 'Capacity', 1);

  const tier = {
    id: newId(),
    eventId,
    name: cleanName,
    priceCents: cleanPrice,
    capacity: cleanCapacity,
    sold: 0,
  };

  store.tiers.set(tier.id, tier);
  event.tierIds.push(tier.id);
  store.waitlists.set(tier.id, new Queue());
  return tier;
}

export function seatsLeft(tier) {
  requireObject(tier, 'Tier');
  requireWholeNumber(tier.capacity, 'capacity', 1);
  requireWholeNumber(tier.sold, 'sold', 0);
  if (tier.sold > tier.capacity) {
    throw new DomainError('INVALID_STATE', 'Sold tickets exceed tier capacity');
  }
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  requireStore(store);
  const cleanUserId = requireText(userId, 'User ID');
  const tier = getTier(store, tierId);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }

  const left = seatsLeft(tier);
  if (left < quantity) {
    const message = left === 0
      ? `${tier.name} is sold out`
      : `Only ${left} ticket(s) left in ${tier.name}`;
    throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
  }

  const amountCents = tier.priceCents * quantity;
  if (!Number.isSafeInteger(amountCents)) {
    throw new DomainError('VALIDATION', 'Booking amount exceeds supported whole-cent range');
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId: cleanUserId,
    tierId,
    quantity,
    amountCents,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  tier.sold += quantity;
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  const cleanRef = requireText(reference, 'Booking reference');
  return store.bookingsByReference.get(cleanRef);
}

export function cancelBooking(store, reference) {
  requireStore(store);
  const booking = findBookingByReference(store, reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (!ACTIVE_BOOKING_STATUSES.has(booking.status)) {
    throw new DomainError('INVALID_STATE', `A ${booking.status} booking cannot be cancelled`);
  }

  const tier = getTier(store, booking.tierId);
  if (tier.sold < booking.quantity) {
    throw new DomainError('INVALID_STATE', 'Booking seats are not reflected in tier inventory');
  }

  tier.sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function joinWaitlist(store, tierId, userId, quantity) {
  requireStore(store);
  const cleanUserId = requireText(userId, 'User ID');
  const tier = getTier(store, tierId);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }

  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }

  const queue = store.waitlists.get(tierId);
  if (!(queue instanceof Queue)) {
    throw new DomainError('INVALID_STATE', 'Tier waitlist is unavailable');
  }

  queue.enqueue({ userId: cleanUserId, quantity });
  return { position: queue.size };
}

export function offerNextOnWaitlist(store, tierId) {
  requireStore(store);
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  if (!(queue instanceof Queue)) {
    throw new DomainError('INVALID_STATE', 'Tier waitlist is unavailable');
  }

  const head = queue.peek();
  if (!head || seatsLeft(tier) < head.quantity) {
    return undefined;
  }
  return queue.dequeue();
}

export function publishEvent(store, eventId) {
  requireStore(store);
  requireText(eventId, 'Event ID');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  if (!Array.isArray(event.tierIds) || event.tierIds.length === 0) {
    throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
  }

  event.status = 'published';
  return event;
}

export function unpublishEvent(store, eventId) {
  requireStore(store);
  requireText(eventId, 'Event ID');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');

  event.status = 'draft';
  return event;
}

export function listEventSummaries(store, { publishedOnly = true } = {}) {
  requireStore(store);
  const summaries = [];

  for (const event of store.events.values()) {
    if (publishedOnly && event.status !== 'published') {
      continue;
    }

    let minPriceCents = null;
    let totalCapacity = 0;
    let totalSold = 0;

    for (const tierId of event.tierIds) {
      const tier = store.tiers.get(tierId);
      if (tier) {
        if (minPriceCents === null || tier.priceCents < minPriceCents) {
          minPriceCents = tier.priceCents;
        }
        totalCapacity += tier.capacity;
        totalSold += tier.sold;
      }
    }

    summaries.push({
      id: event.id,
      organizerId: event.organizerId,
      title: event.title,
      city: event.city,
      venue: event.venue,
      startsAt: event.startsAt,
      status: event.status,
      tierCount: event.tierIds.length,
      minPriceCents,
      seatsLeft: totalCapacity - totalSold,
      totalCapacity,
      totalSold,
    });
  }

  return summaries;
}

