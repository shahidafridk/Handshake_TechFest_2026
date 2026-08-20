const { z } = require('zod');
const { HANDSHAKE_CODE_CHARSET, HANDSHAKE_CODE_LENGTH } = require('../config/constants');

// Built from the same charset constant used to generate codes, so the two
// can never silently drift apart (e.g. someone updating the charset in
// constants.js without remembering this regex exists).
const configuredCodePattern = new RegExp(`^[${HANDSHAKE_CODE_CHARSET}]{${HANDSHAKE_CODE_LENGTH}}$`);
const legacyCodePattern = new RegExp(`^HS[-\\s]?([${HANDSHAKE_CODE_CHARSET}]{4})$`);

function normalizeHandshakeCode(value, ctx) {
  const normalized = value.trim().toUpperCase();

  if (configuredCodePattern.test(normalized)) return normalized;

  const legacyMatch = legacyCodePattern.exec(normalized);
  if (legacyMatch) return `HS-${legacyMatch[1]}`;

  ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid handshake code format.' });
  return z.NEVER;
}

const verifyCodeSchema = z.object({
  code: z
    .string()
    .min(1, 'Handshake code is required.')
    .max(16, 'Invalid handshake code format.')
    .transform(normalizeHandshakeCode),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { verifyCodeSchema, historyQuerySchema };
