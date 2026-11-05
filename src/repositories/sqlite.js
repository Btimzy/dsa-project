// SQLite implementation of the data repository using node:sqlite.
// Provides the exact same asynchronous interface as MemoryRepository.
// Uses parameterized queries (?) exclusively to prevent SQL injection.

import { createDatabaseConnection } from '../db/connection.js';

function mapEventRow(row, tierIds = []) {
  if (!row) return null;
  return {
    id: row.id,
    organizerId: row.organizer_id,
    title: row.title,
    city: row.city,
    venue: row.venue || '',
    startsAt: row.starts_at,
    status: row.status,
    tierIds,
    createdAt: row.created_at,
  };
}

function mapTierRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    priceCents: row.price_cents,
    capacity: row.capacity,
    sold: row.sold,
    createdAt: row.created_at,
  };
}

function mapBookingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    tierId: row.tier_id,
    eventId: row.event_id,
    quantity: row.quantity,
    amountCents: row.amount_cents,
    status: row.status,
    paidAt: row.paid_at || null,
    cancelledAt: row.cancelled_at || null,
    transactionId: row.transaction_id || null,
    createdAt: row.created_at,
  };
}

export class SqliteRepository {
  #db;
  useAtomicReservation = true;

  constructor(db) {
    this.#db = db || createDatabaseConnection();
  }

  get db() {
    return this.#db;
  }

  // --- Events ---

  async createEvent(event) {
    const stmt = this.#db.prepare(`
      INSERT INTO events (id, organizer_id, title, city, venue, starts_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.id,
      event.organizerId,
      event.title,
      event.city,
      event.venue || '',
      event.startsAt,
      event.status || 'draft',
      event.createdAt || new Date().toISOString()
    );
    return this.findEventById(event.id);
  }

  async findEventById(id) {
    const eventStmt = this.#db.prepare('SELECT * FROM events WHERE id = ?');
    const row = eventStmt.get(id);
    if (!row) return null;

    const tiersStmt = this.#db.prepare('SELECT id FROM ticket_tiers WHERE event_id = ?');
    const tierRows = tiersStmt.all(id);
    const tierIds = tierRows.map((t) => t.id);

    return mapEventRow(row, tierIds);
  }

  async updateEvent(id, partial) {
    const current = await this.findEventById(id);
    if (!current) return null;

    const fields = [];
    const values = [];

    if (partial.title !== undefined) {
      fields.push('title = ?');
      values.push(partial.title);
    }
    if (partial.city !== undefined) {
      fields.push('city = ?');
      values.push(partial.city);
    }
    if (partial.venue !== undefined) {
      fields.push('venue = ?');
      values.push(partial.venue);
    }
    if (partial.startsAt !== undefined) {
      fields.push('starts_at = ?');
      values.push(partial.startsAt);
    }
    if (partial.status !== undefined) {
      fields.push('status = ?');
      values.push(partial.status);
    }

    if (fields.length > 0) {
      values.push(id);
      const sql = `UPDATE events SET ${fields.join(', ')} WHERE id = ?`;
      this.#db.prepare(sql).run(...values);
    }

    return this.findEventById(id);
  }

  async listEvents() {
    const eventsStmt = this.#db.prepare('SELECT * FROM events ORDER BY created_at ASC');
    const rows = eventsStmt.all();

    const tiersStmt = this.#db.prepare('SELECT id, event_id FROM ticket_tiers');
    const tierRows = tiersStmt.all();
    const tiersByEvent = new Map();
    for (const t of tierRows) {
      if (!tiersByEvent.has(t.event_id)) {
        tiersByEvent.set(t.event_id, []);
      }
      tiersByEvent.get(t.event_id).push(t.id);
    }

    return rows.map((row) => mapEventRow(row, tiersByEvent.get(row.id) || []));
  }

  // --- Tiers ---

  async createTier(tier) {
    const stmt = this.#db.prepare(`
      INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, sold, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      tier.id,
      tier.eventId,
      tier.name,
      tier.priceCents,
      tier.capacity,
      tier.sold || 0,
      tier.createdAt || new Date().toISOString()
    );
    return this.findTierById(tier.id);
  }

  async findTierById(id) {
    const stmt = this.#db.prepare('SELECT * FROM ticket_tiers WHERE id = ?');
    const row = stmt.get(id);
    return mapTierRow(row);
  }

  async findTiersByEventId(eventId) {
    const stmt = this.#db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY price_cents ASC');
    const rows = stmt.all(eventId);
    return rows.map(mapTierRow);
  }

  async updateTier(id, partial) {
    const current = await this.findTierById(id);
    if (!current) return null;

    const fields = [];
    const values = [];

    if (partial.name !== undefined) {
      fields.push('name = ?');
      values.push(partial.name);
    }
    if (partial.priceCents !== undefined) {
      fields.push('price_cents = ?');
      values.push(partial.priceCents);
    }
    if (partial.capacity !== undefined) {
      fields.push('capacity = ?');
      values.push(partial.capacity);
    }
    if (partial.sold !== undefined) {
      fields.push('sold = ?');
      values.push(partial.sold);
    }

    if (fields.length > 0) {
      values.push(id);
      const sql = `UPDATE ticket_tiers SET ${fields.join(', ')} WHERE id = ?`;
      this.#db.prepare(sql).run(...values);
    }

    return this.findTierById(id);
  }

  // --- Atomic Reservation (Build 5 Overselling Fix) ---

  async reserveSeats(tierId, quantity) {
    const stmt = this.#db.prepare(`
      UPDATE ticket_tiers
      SET sold = sold + ?
      WHERE id = ? AND (sold + ?) <= capacity
    `);
    const res = stmt.run(quantity, tierId, quantity);
    return res.changes > 0;
  }

  async releaseSeats(tierId, quantity) {
    const stmt = this.#db.prepare(`
      UPDATE ticket_tiers
      SET sold = MAX(0, sold - ?)
      WHERE id = ?
    `);
    const res = stmt.run(quantity, tierId);
    return res.changes > 0;
  }

  // --- Bookings ---

  async createBooking(booking) {
    const stmt = this.#db.prepare(`
      INSERT INTO bookings (id, reference, user_id, tier_id, event_id, quantity, amount_cents, status, paid_at, cancelled_at, transaction_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      booking.id,
      booking.reference,
      booking.userId,
      booking.tierId,
      booking.eventId,
      booking.quantity,
      booking.amountCents,
      booking.status,
      booking.paidAt || null,
      booking.cancelledAt || null,
      booking.transactionId || null,
      booking.createdAt || new Date().toISOString()
    );
    return this.findBookingById(booking.id);
  }

  async findBookingById(id) {
    const stmt = this.#db.prepare('SELECT * FROM bookings WHERE id = ?');
    const row = stmt.get(id);
    return mapBookingRow(row);
  }

  async findBookingByReference(reference) {
    const stmt = this.#db.prepare('SELECT * FROM bookings WHERE reference = ?');
    const row = stmt.get(reference);
    return mapBookingRow(row);
  }

  async updateBooking(id, partial) {
    const current = await this.findBookingById(id);
    if (!current) return null;

    const fields = [];
    const values = [];

    if (partial.status !== undefined) {
      fields.push('status = ?');
      values.push(partial.status);
    }
    if (partial.paidAt !== undefined) {
      fields.push('paid_at = ?');
      values.push(partial.paidAt);
    }
    if (partial.cancelledAt !== undefined) {
      fields.push('cancelled_at = ?');
      values.push(partial.cancelledAt);
    }
    if (partial.transactionId !== undefined) {
      fields.push('transaction_id = ?');
      values.push(partial.transactionId);
    }

    if (fields.length > 0) {
      values.push(id);
      const sql = `UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`;
      this.#db.prepare(sql).run(...values);
    }

    return this.findBookingById(id);
  }

  async listBookingsByUser(userId) {
    const stmt = this.#db.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(userId);
    return rows.map(mapBookingRow);
  }
}

export function createSqliteRepository(db) {
  return new SqliteRepository(db);
}
