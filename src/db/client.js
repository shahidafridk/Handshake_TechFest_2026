const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const env = require('../config/env');
const logger = require('../utils/logger');

const isProduction = env.NODE_ENV === 'production';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: isProduction
    ? [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ]
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'query' },
      ],
});

prisma.$on('warn', (e) => logger.warn({ prisma: e }, 'Prisma warning'));
prisma.$on('error', (e) => logger.error({ prisma: e }, 'Prisma error'));

if (!isProduction) {
  prisma.$on('query', (e) =>
    logger.debug(
      { query: e.query, params: e.params, duration: e.duration },
      'Prisma query'
    )
  );
}

module.exports = prisma;
