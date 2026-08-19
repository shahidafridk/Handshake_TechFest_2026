// The core of Handshake.sh: turning a submitted code into a verified,
// permanent connection between two people, exactly once, no matter how many
// requests arrive concurrently. See the Module 3 review notes for a full
// walkthrough of the concurrency guarantees here — the short version is:
// every step that matters is either inside one transaction, or backed by a
// database constraint that makes the "impossible" outcome actually
// impossible, not just unlikely.

const prisma = require('../db/client');
const AppError = require('../utils/AppError');
const { sortPair } = require('../utils/sortPair');
const auditLog = require('./auditLog.service');

/**
 * Maps a thrown AppError to the audit event that describes it. Only errors
 * that originate from *this* function's own checks are mapped — anything
 * else (a genuine unexpected error) is not an audit-log concern, it's a bug,
 * and errorHandler.js's generic path already logs it via the app logger.
 */
function auditEventForError(appError) {
  switch (appError.code) {
    case 'CODE_NOT_FOUND':
      return auditLog.EVENTS.INVALID_CODE;
    case 'CODE_EXPIRED':
      return auditLog.EVENTS.CODE_EXPIRED;
    case 'CODE_ALREADY_USED':
    case 'SELF_HANDSHAKE':
      return auditLog.EVENTS.VERIFICATION_FAILED;
    case 'DUPLICATE_PAIR':
      return auditLog.EVENTS.DUPLICATE_HANDSHAKE;
    default:
      return null;
  }
}

/**
 * Verifies a submitted handshake code and, on success, creates the verified
 * connection and increments both participants' handshakeCount.
 *
 * Every validation happens inside a single Prisma transaction, but the
 * mechanism that actually prevents double-redemption is NOT "we checked
 * inside a transaction" — Prisma transactions alone don't serialize reads
 * followed by writes against a row nobody's locked yet. The real guarantee
 * is the `updateMany` claim step below: it's a single atomic UPDATE, and
 * Postgres itself serializes concurrent UPDATEs to the same row, so only
 * one concurrent caller can ever see `count === 1`. See the write-up after
 * this module for the full explanation.
 */
async function verifyCode(submittedCode, requesterId, ipAddress) {
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();

      const codeRow = await tx.handshakeCode.findFirst({
        where: { code: submittedCode, usedAt: null },
        include: { owner: { select: { id: true, isActive: true } } },
      });

      if (!codeRow) {
        throw new AppError('CODE_NOT_FOUND', 'Invalid handshake code.', 404);
      }
      if (codeRow.expiresAt <= now) {
        throw new AppError('CODE_EXPIRED', 'This code expired before it could be verified.', 410);
      }
      if (!codeRow.owner.isActive) {
        throw new AppError('CODE_NOT_FOUND', 'Invalid handshake code.', 404);
      }
      if (codeRow.ownerId === requesterId) {
        throw new AppError('SELF_HANDSHAKE', 'You cannot verify your own handshake code.', 400);
      }

      // Atomic claim. This is the one line in the whole system that
      // prevents two concurrent requests from both successfully redeeming
      // the same code — see the write-up after this module.
      const claim = await tx.handshakeCode.updateMany({
        where: { id: codeRow.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claim.count === 0) {
        throw new AppError('CODE_ALREADY_USED', 'This code has already been redeemed.', 409);
      }

      const [userLowId, userHighId] = sortPair(codeRow.ownerId, requesterId);

      let handshake;
      try {
        handshake = await tx.handshake.create({
          data: {
            initiatorId: codeRow.ownerId,
            responderId: requesterId,
            userLowId,
            userHighId,
            codeId: codeRow.id,
          },
        });
      } catch (err) {
        if (err.code === 'P2002') {
          throw new AppError(
            'DUPLICATE_PAIR',
            'You have already connected with this participant.',
            409
          );
        }
        throw err;
      }

      const [initiator, responder] = await Promise.all([
        tx.user.update({
          where: { id: codeRow.ownerId },
          data: { handshakeCount: { increment: 1 }, lastVerifiedHandshakeAt: now },
        }),
        tx.user.update({
          where: { id: requesterId },
          data: { handshakeCount: { increment: 1 }, lastVerifiedHandshakeAt: now },
        }),
      ]);

      // Logged inside the transaction deliberately — this entry should only
      // exist if the handshake it describes actually committed.
      await auditLog.logEvent(
        {
          event: auditLog.EVENTS.CODE_VERIFIED,
          userId: requesterId,
          targetUserId: codeRow.ownerId,
          ipAddress,
        },
        tx
      );

      return { handshake, initiator, responder };
    });
  } catch (err) {
    if (err instanceof AppError) {
      const event = auditEventForError(err);
      if (event) {
        // The transaction above has already rolled back by this point —
        // logged here, via the plain (non-tx) client, specifically so this
        // entry survives that rollback instead of being undone by it.
        await auditLog.logEvent({
          event,
          userId: requesterId,
          ipAddress,
        });
      }
    }
    throw err;
  }
}

/**
 * @param {string} userId
 * @param {number} limit
 */
async function getHistory(userId, limit) {
  const rows = await prisma.handshake.findMany({
    where: { OR: [{ initiatorId: userId }, { responderId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      initiator: { select: { fullName: true, college: true } },
      responder: { select: { fullName: true, college: true } },
    },
  });

  return rows.map((row) => {
    const isInitiator = row.initiatorId === userId;
    const other = isInitiator ? row.responder : row.initiator;
    return {
      handshake_id: row.id,
      connected_with: { full_name: other?.fullName || '[Deleted User]', college: other?.college || 'N/A' },
      created_at: row.createdAt,
    };
  });
}

async function getRecentForHandshakeList(userId) {
  const rows = await prisma.handshake.findMany({
    where: { OR: [{ initiatorId: userId }, { responderId: userId }] },
    include: {
      initiator: { select: { id: true, fullName: true, username: true, department: true } },
      responder: { select: { id: true, fullName: true, username: true, department: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((row) => {
    const isInitiator = row.initiator?.id === userId;
    const other = isInitiator ? row.responder : row.initiator;
    return {
      id: row.id,
      full_name: other?.fullName || '[Deleted User]',
      username: other?.username || 'deleted',
      department: other?.department || 'Attendee',
      when: new Date(row.createdAt).toLocaleDateString(),
    };
  });
}

module.exports = { verifyCode, getHistory, getRecentForHandshakeList };
