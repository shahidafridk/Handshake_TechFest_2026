// Owns everything about a user's handshake code lifecycle up to the moment
// it's submitted for verification (that part is handshake.service.js —
// deliberately separate, since generation and verification have almost no
// shared logic and mixing them makes both harder to follow).

const prisma = require('../db/client');
const AppError = require('../utils/AppError');
const { generateRandomCode } = require('../utils/codeGenerator');
const { HANDSHAKE_CODE_EXPIRY_SECONDS } = require('../config/constants');
const auditLog = require('./auditLog.service');

const MAX_GENERATION_ATTEMPTS = 5;

function computeExpiry(from = new Date()) {
  return new Date(from.getTime() + HANDSHAKE_CODE_EXPIRY_SECONDS * 1000);
}

/**
 * Attempts to create a brand-new active code for a user who doesn't already
 * have one. Retries on the (extremely rare, given ~30-bit+ entropy)
 * collision with another currently-active code, and separately handles a
 * concurrent double-generate caught by the database's partial unique index
 * (see migration `add_one_active_code_constraint`) — in that case, another
 * request won the race in the moment between this function's own checks and
 * its insert, so the correct behavior is to return whatever that other
 * request created, not to error out.
 *
 * Logs CODE_GENERATED — but only from this function, never from the
 * "return existing code" branch in getOrCreateActiveCode — so the audit
 * trail reflects codes actually minted, not every time a client asked.
 */
async function createUniqueActiveCode(tx, ownerId, ipAddress) {
  const now = new Date();
  const expiresAt = computeExpiry(now);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = generateRandomCode();

    const collidesWithActiveCode = await tx.handshakeCode.findFirst({
      where: { code, usedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (collidesWithActiveCode) continue;

    try {
      const created = await tx.handshakeCode.create({ data: { ownerId, code, expiresAt } });
      await auditLog.logEvent({ event: auditLog.EVENTS.CODE_GENERATED, userId: ownerId, ipAddress }, tx);
      return created;
    } catch (err) {
      if (err.code === 'P2002') {
        // Another concurrent request for this same user already created an
        // active code — the DB constraint caught it, not our pre-check.
        // That request already logged its own CODE_GENERATED entry.
        const winningCode = await tx.handshakeCode.findFirst({
          where: { ownerId, usedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });
        if (winningCode) return winningCode;
        // A unique-code collision belongs to another owner; generate again.
        continue;
      }
      throw err;
    }
  }

  throw new AppError(
    'CODE_GENERATION_FAILED',
    'Could not generate a unique handshake code. Please try again.',
    500
  );
}

/**
 * Returns the user's current active code, generating one if they don't have
 * one. Per Module 3 spec: a user who already has an active code gets that
 * same code back, not a new one — so a double-tap on "Initiate Handshake"
 * is idempotent from the caller's point of view.
 */
async function getOrCreateActiveCode(userId, ipAddress) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    // The active-code index is keyed on usedAt. Marking expired, unused rows
    // unavailable here releases that index slot before a replacement is made.
    await tx.handshakeCode.updateMany({
      where: { ownerId: userId, usedAt: null, expiresAt: { lte: now } },
      data: { usedAt: now },
    });

    const existing = await tx.handshakeCode.findFirst({
      where: { ownerId: userId, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return createUniqueActiveCode(tx, userId, ipAddress);
  });
}

/** Read-only — does not create a code. For GET /my-code. */
async function getActiveCode(userId) {
  return prisma.handshakeCode.findFirst({
    where: { ownerId: userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { getOrCreateActiveCode, getActiveCode };
