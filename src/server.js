// Entrypoint. Deliberately separate from app.js — app.js exports a
// testable Express app with no side effects; this file is the only place
// that actually binds a port or touches process signals, so app.js can be
// imported in tests without starting a real server.

const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');
const prisma = require('./db/client');
const bootstrapAdmins = require('./utils/bootstrapAdmins');

const server = app.listen(env.PORT, async () => {
  logger.info(`Handshake.sh API listening on port ${env.PORT} (${env.NODE_ENV})`);
  await bootstrapAdmins();
});

// Railway/Render send SIGTERM before stopping/replacing a container on every
// deploy. Without handling it, in-flight requests get dropped mid-response
// instead of finishing cleanly.
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Safety net: if something hangs (a stuck connection, a slow query that
  // never resolves), don't let the process hang forever waiting for
  // server.close() — force-exit after a bounded wait.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});
