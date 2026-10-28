// HTTP Application and server skeleton built strictly on node:http.
// Enforces standard error format {"error":{"code","message"}} and path containment for static files.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DomainError } from '../domain/errors.js';
import { createRouter } from './router.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

export function sendJson(res, statusCode, data) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

export function sendError(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
    },
  });
}

function mapDomainErrorCodeToStatus(code) {
  switch (code) {
    case 'VALIDATION':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'SOLD_OUT':
    case 'NOT_SOLD_OUT':
    case 'INVALID_STATE':
    case 'INVALID_TRANSITION':
      return 409;
    default:
      return 400;
  }
}

async function readRequestBody(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (raw.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new SyntaxError('Malformed JSON payload');
    error.status = 400;
    throw error;
  }
}

export function createRequestHandler({ router = createRouter(), publicDir = path.resolve(process.cwd(), 'public') } = {}) {
  const resolvedPublicDir = path.resolve(publicDir);

  return async function requestHandler(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. Health check endpoint
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }

    // 2. Parse JSON body if present
    try {
      req.body = await readRequestBody(req);
    } catch {
      return sendError(res, 400, 'BAD_REQUEST', 'Malformed JSON payload in request body');
    }

    // 3. Match defined routes
    const match = router.match(req.method, pathname);
    if (match) {
      try {
        req.params = match.params;
        await match.handler(req, res, { params: match.params });
        return;
      } catch (err) {
        if (err instanceof DomainError) {
          const status = mapDomainErrorCodeToStatus(err.code);
          return sendError(res, status, err.code, err.message);
        }
        // Stack trace must never reach client
        return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred');
      }
    }

    // 4. Unknown /api paths return JSON 404
    if (pathname.startsWith('/api')) {
      return sendError(res, 404, 'NOT_FOUND', `Cannot ${req.method} ${pathname}`);
    }

    // 5. Static file serving with strict path containment
    if (req.method === 'GET' || req.method === 'HEAD') {
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathname);
      } catch {
        return sendError(res, 400, 'BAD_REQUEST', 'Invalid path encoding');
      }

      const cleanRelative = decodedPath === '/' ? '/index.html' : decodedPath;
      const targetFilePath = path.resolve(resolvedPublicDir, '.' + cleanRelative);

      // Verify that targetFilePath is strictly inside resolvedPublicDir
      if (!targetFilePath.startsWith(resolvedPublicDir + path.sep) && targetFilePath !== resolvedPublicDir) {
        return sendError(res, 403, 'FORBIDDEN', 'Access to the requested path is forbidden');
      }

      let stat;
      try {
        stat = await fs.promises.stat(targetFilePath);
        if (stat.isDirectory()) {
          const indexPath = path.join(targetFilePath, 'index.html');
          stat = await fs.promises.stat(indexPath);
          return serveFile(indexPath, stat, req, res);
        }
      } catch {
        return sendError(res, 404, 'NOT_FOUND', 'File not found');
      }

      return serveFile(targetFilePath, stat, req, res);
    }

    return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${req.method} not allowed`);
  };
}

function serveFile(filePath, stat, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
  });

  if (req.method === 'HEAD') {
    return res.end();
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Error streaming static file');
    }
  });
  stream.pipe(res);
}

export function createApp(options = {}) {
  const handler = createRequestHandler(options);
  const server = http.createServer(handler);
  server.handler = handler;
  return server;
}
