// Central place for values that would otherwise be magic numbers scattered
// across services. Everything here is sourced from env.js (already
// validated), not redefined — this file exists for readability at call
// sites, not as a second source of truth.

const env = require('./env');

module.exports = {
  JWT_SECRET: env.JWT_SECRET,
  JWT_EXPIRY: env.JWT_EXPIRY,

  BCRYPT_ROUNDS: env.BCRYPT_ROUNDS,

  HANDSHAKE_CODE_LENGTH: env.HANDSHAKE_CODE_LENGTH,
  HANDSHAKE_CODE_EXPIRY_SECONDS: env.HANDSHAKE_CODE_EXPIRY_MINUTES * 60,

  // Excludes 0/O, 1/I/L — ambiguous on a phone screen outdoors. Locked in
  // the architecture doc; changing this invalidates the entropy assumptions
  // documented there, so don't tweak it without re-checking that math.
  HANDSHAKE_CODE_CHARSET: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',

  LOGIN_RATE_LIMIT_WINDOW_MINUTES: 5,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: 20,

  // Deliberately tight: codes are only 6-8 chars, so without a strict
  // per-user limit here, brute-forcing a currently-active code belonging to
  // someone nearby would be practical within its 2-minute window. This is
  // the single most important rate limit in the whole system.
  VERIFY_CODE_RATE_LIMIT_WINDOW_MINUTES: 1,
  VERIFY_CODE_RATE_LIMIT_MAX_ATTEMPTS: 5,
};
