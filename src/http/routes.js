// Route definitions for the Event Ticketing REST API.
// Delegates business operations to injected eventService and bookingService instances.

import { DomainError } from '../domain/errors.js';
import { sendJson } from './app.js';

function getUserId(req) {
  const userId = req.headers['x-user-id'];
  if (!userId || (typeof userId === 'string' && userId.trim().length === 0)) {
    throw new DomainError('UNAUTHORIZED', 'Missing x-user-id header');
  }
  return userId.trim();
}

export function registerRoutes(router, { eventService, bookingService }) {
  // 1. Create event
  router.post('/api/events', async (req, res) => {
    const userId = getUserId(req);
    const event = await eventService.createEvent(userId, req.body);
    sendJson(res, 201, event);
  });

  // 2. Add tier to event
  router.post('/api/events/:id/tiers', async (req, res, { params }) => {
    const userId = getUserId(req);
    const tier = await eventService.addTier(userId, params.id, req.body);
    sendJson(res, 201, tier);
  });

  // 3. Publish event
  router.post('/api/events/:id/publish', async (req, res, { params }) => {
    const userId = getUserId(req);
    const event = await eventService.publishEvent(userId, params.id);
    sendJson(res, 200, event);
  });

  // 4. Search and filter events
  router.get('/api/events', async (req, res) => {
    const query = req.query || {};
    const criteria = {
      q: query.q,
      city: query.city,
      from: query.from,
      to: query.to,
      onlyAvailable: query.onlyAvailable === 'true',
    };

    if (query.maxPriceCents !== undefined && query.maxPriceCents !== '') {
      const parsed = Number(query.maxPriceCents);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new DomainError('VALIDATION', 'maxPriceCents must be a non-negative whole number of cents');
      }
      criteria.maxPriceCents = parsed;
    }

    const sortBy = query.sortBy || 'date';
    const summaries = await eventService.listEventSummaries(criteria, sortBy, { publishedOnly: true });
    sendJson(res, 200, summaries);
  });

  // 5. Book tickets
  router.post('/api/bookings', async (req, res) => {
    const userId = getUserId(req);
    const booking = await bookingService.bookTickets(userId, req.body);
    sendJson(res, 201, booking);
  });

  // 6. Pay for booking
  router.post('/api/bookings/:reference/pay', async (req, res, { params }) => {
    const userId = getUserId(req);
    const result = await bookingService.payBooking(userId, params.reference, req.body);
    sendJson(res, 200, result);
  });

  // 7. Cancel unpaid booking
  router.post('/api/bookings/:reference/cancel', async (req, res, { params }) => {
    const userId = getUserId(req);
    const cancelled = await bookingService.cancelBooking(userId, params.reference);
    sendJson(res, 200, cancelled);
  });
}
