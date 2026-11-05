import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDbPath = fileURLToPath(new URL('../data/ticketing.db', import.meta.url));

export const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || defaultDbPath,
};
