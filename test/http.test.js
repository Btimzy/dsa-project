import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRouter } from '../src/http/router.js';
import { createApp, sendJson } from '../src/http/app.js';
import { DomainError } from '../src/domain/errors.js';

test('router - matches static paths and extracts :params', () => {
  const router = createRouter();
  router.get('/events', () => 'events_list');
  router.get('/events/:id', () => 'event_detail');
  router.post('/events/:eventId/tiers/:tierId/book', () => 'book_tier');

  // Static match
  const match1 = router.match('GET', '/events');
  assert.ok(match1);
  assert.equal(match1.handler(), 'events_list');
  assert.deepEqual(match1.params, {});

  // Single param match
  const match2 = router.match('GET', '/events/evt-123');
  assert.ok(match2);
  assert.equal(match2.handler(), 'event_detail');
  assert.deepEqual(match2.params, { id: 'evt-123' });

  // Multiple params match
  const match3 = router.match('POST', '/events/evt-99/tiers/tier-5/book');
  assert.ok(match3);
  assert.equal(match3.handler(), 'book_tier');
  assert.deepEqual(match3.params, { eventId: 'evt-99', tierId: 'tier-5' });

  // Method mismatch
  assert.equal(router.match('POST', '/events'), null);

  // Path mismatch
  assert.equal(router.match('GET', '/unknown'), null);
});

// Helper for making real HTTP requests against a test server instance
function makeRequest(server, options, requestBody = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
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

    if (requestBody !== null) {
      req.write(typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody));
    }
    req.end();
  });
}

test('HTTP server - real request to /health returns status 200 with {"status":"ok"}', async () => {
  const router = createRouter();
  const server = createApp({ router });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await makeRequest(server, { path: '/health', method: 'GET' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, { status: 'ok' });
    assert.equal(response.headers['content-type'], 'application/json');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP server - unknown /api path returns 404 with error shape {"error":{"code","message"}}', async () => {
  const router = createRouter();
  const server = createApp({ router });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await makeRequest(server, { path: '/api/v1/unknown-endpoint', method: 'GET' });
    assert.equal(response.statusCode, 404);
    assert.ok(response.json);
    assert.ok(response.json.error);
    assert.equal(response.json.error.code, 'NOT_FOUND');
    assert.ok(typeof response.json.error.message === 'string');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP server - malformed JSON payload returns 400 with standard error shape', async () => {
  const router = createRouter();
  router.post('/api/test', (req, res) => {
    sendJson(res, 200, { ok: true });
  });

  const server = createApp({ router });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await makeRequest(
      server,
      {
        path: '/api/test',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      '{ bad json: invalid '
    );

    assert.equal(response.statusCode, 400);
    assert.ok(response.json);
    assert.ok(response.json.error);
    assert.equal(response.json.error.code, 'BAD_REQUEST');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP server - serves static files from public/ and blocks directory traversal', async () => {
  const router = createRouter();
  const publicDir = path.resolve(process.cwd(), 'public');
  const server = createApp({ router, publicDir });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 1. Root path serves index.html
    const indexRes = await makeRequest(server, { path: '/', method: 'GET' });
    assert.equal(indexRes.statusCode, 200);
    assert.ok(indexRes.headers['content-type'].includes('text/html'));
    assert.ok(indexRes.body.includes('Event Ticketing and Booking'));

    // 2. Traversal attempt trying to escape public directory
    const traversalRes = await makeRequest(server, { path: '/../../package.json', method: 'GET' });
    assert.ok(traversalRes.statusCode === 403 || traversalRes.statusCode === 404);
    assert.ok(traversalRes.json.error);
    assert.ok(!traversalRes.body.includes('ticketing-capstone'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP server - unexpected errors return 500 without leaking stack traces', async () => {
  const router = createRouter();
  router.get('/api/boom', () => {
    throw new Error('Secret database password leaked in stack trace: sensitive_value_123');
  });

  const server = createApp({ router });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await makeRequest(server, { path: '/api/boom', method: 'GET' });
    assert.equal(response.statusCode, 500);
    assert.ok(response.json);
    assert.equal(response.json.error.code, 'INTERNAL_SERVER_ERROR');
    // Ensure stack trace and error message details never leak
    assert.ok(!response.body.includes('sensitive_value_123'));
    assert.ok(!response.body.includes('Error:'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('HTTP server - maps DomainError to corresponding status code and error shape', async () => {
  const router = createRouter();
  router.get('/api/domain-error', () => {
    throw new DomainError('VALIDATION', 'Title is missing');
  });

  const server = createApp({ router });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const response = await makeRequest(server, { path: '/api/domain-error', method: 'GET' });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json, {
      error: {
        code: 'VALIDATION',
        message: 'Title is missing',
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
