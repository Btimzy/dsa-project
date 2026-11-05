import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildServer } from '../src/server.js';
import { createMemoryRepository } from '../src/repositories/memory.js';
import { createMockPaymentGateway } from '../src/lib/mockPaymentGateway.js';

function requestApi(server, { method = 'GET', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: raw,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    if (body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test('Build 4 REST API - End-to-end integration tests', async (t) => {
  const repo = createMemoryRepository();
  const paymentGateway = createMockPaymentGateway();
  const server = buildServer({ repo, paymentGateway });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  let createdEventId;
  let createdTierId;
  let bookingReference;

  await t.test('S02 API: Organizer creates event - saved as draft with new id, not on public list', async () => {
    // 1. Missing x-user-id returns 401
    const unauth = await requestApi(server, {
      method: 'POST',
      path: '/api/events',
      body: { title: 'Lagos Tech Fest', city: 'Lagos', startsAt: '2026-11-20T18:00:00Z' },
    });
    assert.equal(unauth.statusCode, 401);
    assert.equal(unauth.json.error.code, 'UNAUTHORIZED');

    // 2. Validation error on missing title
    const invalid = await requestApi(server, {
      method: 'POST',
      path: '/api/events',
      headers: { 'x-user-id': 'org_1' },
      body: { title: '', city: 'Lagos', startsAt: '2026-11-20T18:00:00Z' },
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json.error.code, 'VALIDATION');

    // 3. Valid creation
    const res = await requestApi(server, {
      method: 'POST',
      path: '/api/events',
      headers: { 'x-user-id': 'org_1' },
      body: {
        title: 'Lagos Tech Fest',
        city: 'Lagos',
        venue: 'Landmark',
        startsAt: '2026-11-20T18:00:00Z',
      },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json.id);
    assert.equal(res.json.status, 'draft');
    assert.equal(res.json.organizerId, 'org_1');
    createdEventId = res.json.id;

    // Draft is not visible on public list
    const publicList = await requestApi(server, { method: 'GET', path: '/api/events' });
    assert.equal(publicList.statusCode, 200);
    assert.equal(publicList.json.length, 0);
  });

  await t.test('S03 API: Organizer adds ticket tier', async () => {
    // 1. Non-existent event returns 404
    const notFound = await requestApi(server, {
      method: 'POST',
      path: '/api/events/non-existent-id/tiers',
      headers: { 'x-user-id': 'org_1' },
      body: { name: 'VIP', priceCents: 100000, capacity: 50 },
    });
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.json.error.code, 'NOT_FOUND');

    // 2. Invalid capacity returns 400
    const badCapacity = await requestApi(server, {
      method: 'POST',
      path: `/api/events/${createdEventId}/tiers`,
      headers: { 'x-user-id': 'org_1' },
      body: { name: 'VIP', priceCents: 100000, capacity: 0 },
    });
    assert.equal(badCapacity.statusCode, 400);
    assert.equal(badCapacity.json.error.code, 'VALIDATION');

    // 3. Valid tier creation
    const res = await requestApi(server, {
      method: 'POST',
      path: `/api/events/${createdEventId}/tiers`,
      headers: { 'x-user-id': 'org_1' },
      body: { name: 'General', priceCents: 500_000, capacity: 3 },
    });
    assert.equal(res.statusCode, 201);
    assert.ok(res.json.id);
    assert.equal(res.json.sold, 0);
    assert.equal(res.json.capacity, 3);
    createdTierId = res.json.id;
  });

  await t.test('S04 API: Publish and unpublish event', async () => {
    // 1. Publishing an event with no tiers throws INVALID_STATE (tested with fresh event)
    const emptyEvent = await requestApi(server, {
      method: 'POST',
      path: '/api/events',
      headers: { 'x-user-id': 'org_1' },
      body: { title: 'Empty Event', city: 'Abuja', startsAt: '2026-12-01T10:00:00Z' },
    });
    const emptyPublish = await requestApi(server, {
      method: 'POST',
      path: `/api/events/${emptyEvent.json.id}/publish`,
      headers: { 'x-user-id': 'org_1' },
    });
    assert.equal(emptyPublish.statusCode, 409);
    assert.equal(emptyPublish.json.error.code, 'INVALID_STATE');

    // 2. Publishing createdEvent succeeds
    const pub = await requestApi(server, {
      method: 'POST',
      path: `/api/events/${createdEventId}/publish`,
      headers: { 'x-user-id': 'org_1' },
    });
    assert.equal(pub.statusCode, 200);
    assert.equal(pub.json.status, 'published');

    // Now it appears on public list
    const publicList = await requestApi(server, { method: 'GET', path: '/api/events' });
    assert.equal(publicList.statusCode, 200);
    assert.equal(publicList.json.length, 1);
    assert.equal(publicList.json[0].id, createdEventId);
  });

  await t.test('S05 API: Search, filter, and sort events via query parameters', async () => {
    // Filter by city
    const lagosOnly = await requestApi(server, { method: 'GET', path: '/api/events?city=lagos' });
    assert.equal(lagosOnly.statusCode, 200);
    assert.equal(lagosOnly.json.length, 1);

    const abujaOnly = await requestApi(server, { method: 'GET', path: '/api/events?city=abuja' });
    assert.equal(abujaOnly.statusCode, 200);
    assert.equal(abujaOnly.json.length, 0);

    // Filter by max price
    const cheapEvents = await requestApi(server, { method: 'GET', path: '/api/events?maxPriceCents=100' });
    assert.equal(cheapEvents.statusCode, 200);
    assert.equal(cheapEvents.json.length, 0);

    // Invalid max price throws VALIDATION (400)
    const badPrice = await requestApi(server, { method: 'GET', path: '/api/events?maxPriceCents=invalid' });
    assert.equal(badPrice.statusCode, 400);
    assert.equal(badPrice.json.error.code, 'VALIDATION');
  });

  await t.test('S06 API: Book tickets', async () => {
    // 1. Quantity validation (0 rejected)
    const zeroTickets = await requestApi(server, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'x-user-id': 'attendee_ada' },
      body: { tierId: createdTierId, quantity: 0 },
    });
    assert.equal(zeroTickets.statusCode, 400);
    assert.equal(zeroTickets.json.error.code, 'VALIDATION');

    // 2. Book 2 tickets (capacity 3 -> 1 left)
    const booking = await requestApi(server, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'x-user-id': 'attendee_ada' },
      body: { tierId: createdTierId, quantity: 2 },
    });
    assert.equal(booking.statusCode, 201);
    assert.equal(booking.json.quantity, 2);
    assert.equal(booking.json.amountCents, 1_000_000);
    assert.equal(booking.json.status, 'pending');
    assert.ok(booking.json.reference);
    bookingReference = booking.json.reference;

    // 3. Try to book 2 more (only 1 left) -> 409 SOLD_OUT
    const soldOut = await requestApi(server, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'x-user-id': 'attendee_bayo' },
      body: { tierId: createdTierId, quantity: 2 },
    });
    assert.equal(soldOut.statusCode, 409);
    assert.equal(soldOut.json.error.code, 'SOLD_OUT');
  });

  await t.test('S07 API: Mock payment for booking', async () => {
    // 1. Caller not authorized (different user attempts to pay)
    const wrongUser = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bookingReference}/pay`,
      headers: { 'x-user-id': 'attacker_user' },
      body: { shouldDecline: false },
    });
    assert.equal(wrongUser.statusCode, 403);
    assert.equal(wrongUser.json.error.code, 'FORBIDDEN');

    // 2. Mock payment declined -> 402 PAYMENT_DECLINED, booking remains pending
    const declined = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bookingReference}/pay`,
      headers: { 'x-user-id': 'attendee_ada' },
      body: { shouldDecline: true, declineReason: 'Card expired' },
    });
    assert.equal(declined.statusCode, 402);
    assert.equal(declined.json.error.code, 'PAYMENT_DECLINED');

    // Verify booking is still pending in repository
    const pendingBooking = await repo.findBookingByReference(bookingReference);
    assert.equal(pendingBooking.status, 'pending');

    // 3. Valid payment succeeds -> 200 OK, status = paid
    const paidRes = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bookingReference}/pay`,
      headers: { 'x-user-id': 'attendee_ada' },
      body: { shouldDecline: false },
    });
    assert.equal(paidRes.statusCode, 200);
    assert.equal(paidRes.json.booking.status, 'paid');
    assert.ok(paidRes.json.payment.transactionId);
    assert.equal(paidRes.json.booking.reference, bookingReference);

    // 4. Paying again is rejected (card charged only once) -> 409 INVALID_TRANSITION
    const payAgain = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bookingReference}/pay`,
      headers: { 'x-user-id': 'attendee_ada' },
      body: { shouldDecline: false },
    });
    assert.equal(payAgain.statusCode, 409);
    assert.equal(payAgain.json.error.code, 'INVALID_TRANSITION');
  });

  await t.test('Build 4 API: Cancel unpaid booking and refuse paying cancelled bookings', async () => {
    // 1. Create a second booking for attendee_bayo (1 ticket)
    const bayoBooking = await requestApi(server, {
      method: 'POST',
      path: '/api/bookings',
      headers: { 'x-user-id': 'attendee_bayo' },
      body: { tierId: createdTierId, quantity: 1 },
    });
    assert.equal(bayoBooking.statusCode, 201);
    const bayoRef = bayoBooking.json.reference;

    // 2. Cancel unpaid booking -> 200 OK, status = cancelled, releases seat
    const cancelRes = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bayoRef}/cancel`,
      headers: { 'x-user-id': 'attendee_bayo' },
    });
    assert.equal(cancelRes.statusCode, 200);
    assert.equal(cancelRes.json.status, 'cancelled');

    // 3. Trying to pay for cancelled booking is rejected with INVALID_TRANSITION
    const payCancelled = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bayoRef}/pay`,
      headers: { 'x-user-id': 'attendee_bayo' },
      body: { shouldDecline: false },
    });
    assert.equal(payCancelled.statusCode, 409);
    assert.equal(payCancelled.json.error.code, 'INVALID_TRANSITION');

    // 4. Paid booking cannot be cancelled via unpaid cancel endpoint
    const cancelPaid = await requestApi(server, {
      method: 'POST',
      path: `/api/bookings/${bookingReference}/cancel`,
      headers: { 'x-user-id': 'attendee_ada' },
    });
    assert.equal(cancelPaid.statusCode, 409);
    assert.equal(cancelPaid.json.error.code, 'INVALID_STATE');
  });
});
