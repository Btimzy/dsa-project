// In-memory data repository with asynchronous operations for events, tiers, and bookings.
// Services receive this repository instance as a dependency injection argument.

export class MemoryRepository {
  #events = new Map();
  #tiers = new Map();
  #bookings = new Map();
  #bookingsByReference = new Map();

  // --- Events ---

  async createEvent(event) {
    const clone = structuredClone(event);
    this.#events.set(clone.id, clone);
    return structuredClone(clone);
  }

  async findEventById(id) {
    const event = this.#events.get(id);
    return event ? structuredClone(event) : null;
  }

  async updateEvent(id, partial) {
    const event = this.#events.get(id);
    if (!event) return null;
    const updated = { ...event, ...partial, id: event.id };
    this.#events.set(id, updated);
    return structuredClone(updated);
  }

  async listEvents() {
    return Array.from(this.#events.values()).map((e) => structuredClone(e));
  }

  // --- Tiers ---

  async createTier(tier) {
    const clone = structuredClone(tier);
    this.#tiers.set(clone.id, clone);
    return structuredClone(clone);
  }

  async findTierById(id) {
    const tier = this.#tiers.get(id);
    return tier ? structuredClone(tier) : null;
  }

  async findTiersByEventId(eventId) {
    const results = [];
    for (const tier of this.#tiers.values()) {
      if (tier.eventId === eventId) {
        results.push(structuredClone(tier));
      }
    }
    return results;
  }

  async updateTier(id, partial) {
    const tier = this.#tiers.get(id);
    if (!tier) return null;
    const updated = { ...tier, ...partial, id: tier.id };
    this.#tiers.set(id, updated);
    return structuredClone(updated);
  }

  // --- Bookings ---

  async createBooking(booking) {
    const clone = structuredClone(booking);
    this.#bookings.set(clone.id, clone);
    this.#bookingsByReference.set(clone.reference, clone);
    return structuredClone(clone);
  }

  async findBookingById(id) {
    const booking = this.#bookings.get(id);
    return booking ? structuredClone(booking) : null;
  }

  async findBookingByReference(reference) {
    const booking = this.#bookingsByReference.get(reference);
    return booking ? structuredClone(booking) : null;
  }

  async updateBooking(id, partial) {
    const booking = this.#bookings.get(id);
    if (!booking) return null;
    const updated = { ...booking, ...partial, id: booking.id, reference: booking.reference };
    this.#bookings.set(id, updated);
    this.#bookingsByReference.set(updated.reference, updated);
    return structuredClone(updated);
  }

  async listBookingsByUser(userId) {
    const results = [];
    for (const booking of this.#bookings.values()) {
      if (booking.userId === userId) {
        results.push(structuredClone(booking));
      }
    }
    return results;
  }
}

export function createMemoryRepository() {
  return new MemoryRepository();
}
