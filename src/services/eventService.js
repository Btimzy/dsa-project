// Event domain service managing event lifecycle, tier assignments, publishing, and search.
// Reuses domain search and sorting logic directly without duplication.

import { DomainError } from '../domain/errors.js';
import { newId } from '../domain/ids.js';
import { filterEvents, sortEvents } from '../domain/eventSearch.js';

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

export class EventService {
  #repo;

  constructor(repo) {
    if (!repo) {
      throw new TypeError('A repository instance is required by EventService');
    }
    this.#repo = repo;
  }

  async createEvent(organizerId, input = {}) {
    const cleanOrganizerId = requireText(organizerId, 'Organizer ID');
    const { title, city, venue = '', startsAt } = input || {};
    const cleanTitle = requireText(title, 'Title');
    const cleanCity = requireText(city, 'City');

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
      createdAt: new Date().toISOString(),
    };

    return this.#repo.createEvent(event);
  }

  async addTier(organizerId, eventId, input = {}) {
    requireText(organizerId, 'Organizer ID');
    const cleanEventId = requireText(eventId, 'Event ID');
    const event = await this.#repo.findEventById(cleanEventId);
    if (!event) {
      throw new DomainError('NOT_FOUND', `Event ${cleanEventId} not found`);
    }

    const { name, priceCents, capacity } = input || {};
    const cleanName = requireText(name, 'Tier name');
    const cleanPrice = requireWholeNumber(priceCents, 'Price (in cents)', 0);
    const cleanCapacity = requireWholeNumber(capacity, 'Capacity', 1);

    const tier = {
      id: newId(),
      eventId: cleanEventId,
      name: cleanName,
      priceCents: cleanPrice,
      capacity: cleanCapacity,
      sold: 0,
      createdAt: new Date().toISOString(),
    };

    const savedTier = await this.#repo.createTier(tier);
    const updatedTierIds = [...(event.tierIds || []), savedTier.id];
    await this.#repo.updateEvent(event.id, { tierIds: updatedTierIds });

    return savedTier;
  }

  async publishEvent(organizerId, eventId) {
    requireText(organizerId, 'Organizer ID');
    const cleanEventId = requireText(eventId, 'Event ID');
    const event = await this.#repo.findEventById(cleanEventId);
    if (!event) {
      throw new DomainError('NOT_FOUND', `Event ${cleanEventId} not found`);
    }

    const tiers = await this.#repo.findTiersByEventId(cleanEventId);
    if (!tiers || tiers.length === 0) {
      throw new DomainError('INVALID_STATE', 'Cannot publish an event with no ticket tiers');
    }

    return this.#repo.updateEvent(event.id, { status: 'published' });
  }

  async unpublishEvent(organizerId, eventId) {
    requireText(organizerId, 'Organizer ID');
    const cleanEventId = requireText(eventId, 'Event ID');
    const event = await this.#repo.findEventById(cleanEventId);
    if (!event) {
      throw new DomainError('NOT_FOUND', `Event ${cleanEventId} not found`);
    }

    return this.#repo.updateEvent(event.id, { status: 'draft' });
  }

  async getEventById(eventId) {
    const cleanEventId = requireText(eventId, 'Event ID');
    const event = await this.#repo.findEventById(cleanEventId);
    if (!event) {
      throw new DomainError('NOT_FOUND', `Event ${cleanEventId} not found`);
    }
    const tiers = await this.#repo.findTiersByEventId(cleanEventId);
    return { ...event, tiers };
  }

  async listEventSummaries(criteria = {}, sortBy = 'date', { publishedOnly = true } = {}) {
    const events = await this.#repo.listEvents();
    const summaries = [];

    for (const event of events) {
      if (publishedOnly && event.status !== 'published') {
        continue;
      }

      const tiers = await this.#repo.findTiersByEventId(event.id);
      let minPriceCents = null;
      let totalCapacity = 0;
      let totalSold = 0;

      for (const tier of tiers) {
        if (minPriceCents === null || tier.priceCents < minPriceCents) {
          minPriceCents = tier.priceCents;
        }
        totalCapacity += tier.capacity;
        totalSold += tier.sold;
      }

      summaries.push({
        id: event.id,
        organizerId: event.organizerId,
        title: event.title,
        city: event.city,
        venue: event.venue,
        startsAt: event.startsAt,
        status: event.status,
        tierCount: tiers.length,
        minPriceCents,
        seatsLeft: totalCapacity - totalSold,
        totalCapacity,
        totalSold,
      });
    }

    const filtered = filterEvents(summaries, criteria);
    return sortEvents(filtered, sortBy);
  }
}

export function createEventService(repo) {
  return new EventService(repo);
}
