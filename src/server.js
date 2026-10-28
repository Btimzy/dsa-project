import { createApp } from './http/app.js';
import { createRouter } from './http/router.js';
import { config } from './config.js';

const router = createRouter();

const server = createApp({ router });

server.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
});
