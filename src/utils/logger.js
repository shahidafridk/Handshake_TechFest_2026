// Structured JSON logging via pino — Railway/Render both capture stdout and
// index it as-is, so structured (not pretty-printed) logs in production are
// what makes searching/filtering logs by field actually work later.

const pino = require('pino');
const env = require('../config/env');

const isProduction = env.NODE_ENV === 'production';

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: {
    // Belt-and-suspenders: even though passwords/tokens should never be
    // passed to the logger in the first place, redact known-sensitive key
    // names so a future `logger.info(req.body)` mistake doesn't leak a
    // password or JWT into log storage.
    paths: [
      'password', 'passwordHash', 'token',
      '*.password', '*.passwordHash', '*.token',
      'authorization', '*.authorization',
      'cookie', '*.cookie',
      'jwt_secret', '*.jwt_secret',
      'req.headers.authorization', 'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
