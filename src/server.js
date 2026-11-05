import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './http/app.js';
import { createRouter } from './http/router.js';
import { registerRoutes } from './http/routes.js';
import { createSqliteRepository } from './repositories/sqlite.js';
import { createMockPaymentGateway } from './lib/mockPaymentGateway.js';
import { createEventService } from './services/eventService.js';
import { createBookingService } from './services/bookingService.js';
import { config } from './config.js';

export function buildServer(options = {}) {
  const router = createRouter();
  const repo = options.repo || createSqliteRepository();
  const paymentGateway = options.paymentGateway || createMockPaymentGateway();

  const eventService = createEventService(repo);
  const bookingService = createBookingService(repo, paymentGateway);

  registerRoutes(router, { eventService, bookingService });

  const app = createApp({ router, ...options });
  app.repo = repo;
  app.paymentGateway = paymentGateway;
  app.eventService = eventService;
  app.bookingService = bookingService;

  return app;
}

// Only start the HTTP listener when executed directly from CLI (e.g. `npm start` or `node src/server.js`)
const currentFilePath = fileURLToPath(import.meta.url).toLowerCase();
const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === currentFilePath;

if (isMain) {
  const server = buildServer();
  server.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}
