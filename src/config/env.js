// Validates and exports environment configuration.
//
// Deliberately fails fast: if a required variable is missing or malformed,
// the process exits with a clear error at boot rather than failing on the
// first request that happens to touch the broken value (or worse, silently
// using `undefined` somewhere). This runs once, before anything else in the
// app imports it.

const { z } = require('zod');
require('dotenv').config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),

  // Comma-separated list, e.g. "https://handshake.sh,https://admin.handshake.sh".
  // Defaults to empty (no origins allowed) rather than "*" — an open CORS
  // policy is the kind of thing that's easy to forget to lock down later,
  // so the default should be the safe one, not the convenient one.
  ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((val) => val.split(',').map((o) => o.trim()).filter(Boolean)),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters — generate with `openssl rand -base64 48`'),
  JWT_EXPIRY: z.string().default('12h'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  HANDSHAKE_CODE_LENGTH: z.coerce.number().int().min(6).max(8).default(6),
  HANDSHAKE_CODE_EXPIRY_SECONDS: z.coerce.number().int().positive().default(45),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Intentionally bypasses the logger here — this fires before logger.js's
  // own env-dependent setup could be trusted to work.
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

module.exports = parsed.data;
