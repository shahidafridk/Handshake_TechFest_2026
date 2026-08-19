// Shared user-related read logic used across multiple features (auth's
// /me, dashboard, leaderboard, public profile) — kept separate from
// auth.service.js so it doesn't get tangled with login-specific logic.
//
// The ranking algorithm lives in exactly one place (getRank, below) and is
// used identically by /me and /leaderboard — a user must see the same rank
// number regardless of which endpoint they check.

const prisma = require('../db/client');

/**
 * Computes a user's 1-indexed rank using the full ranking algorithm:
 * handshakeCount DESC, lastVerifiedHandshakeAt ASC as a tiebreaker (whoever
 * reached a tied count first ranks higher). This is a strict total order,
 * not competition-style shared ranks — the tiebreaker exists specifically
 * to make ties resolve deterministically, so two distinct users are never
 * assigned the same rank number.
 *
 * The one case with no meaningful tiebreak is multiple users tied at zero
 * handshakes (lastVerifiedHandshakeAt is null for all of them) — comparing
 * null timestamps is intentionally a no-op below, so they naturally end up
 * with the same rank number among themselves, which is the only sensible
 * outcome when "who connected first" doesn't apply.
 */
async function getRank(userId, handshakeCount, lastVerifiedHandshakeAt) {
  const tieBreakerClause = lastVerifiedHandshakeAt
    ? [{ handshakeCount, lastVerifiedHandshakeAt: { lt: lastVerifiedHandshakeAt } }]
    : [];

  const higherRankedCount = await prisma.user.count({
    where: {
      isActive: true,
      OR: [{ handshakeCount: { gt: handshakeCount } }, ...tieBreakerClause],
    },
  });

  return higherRankedCount + 1;
}

/**
 * Shapes a User row into the profile object returned when a user is looking
 * at THEIR OWN data (e.g. /me). Includes fields (email) that are correct to
 * return to the account's own owner but must never appear in any
 * other-facing response — see toPublicMinimalProfile for that case.
 */
function toPublicProfile(user, rank) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.fullName,
    college: user.college,
    department: user.department,
    year: user.year,
    phone: user.phone,
    profile_photo_url: user.profilePhotoUrl,
    handshake_count: user.handshakeCount,
    rank,
    is_admin: user.isAdmin,
  };
}

/**
 * Shapes a User row for any OTHER-facing context — leaderboard rows, public
 * profile lookups. Deliberately a strict allowlist, not toPublicProfile
 * minus some fields: a field added to toPublicProfile in the future (e.g. a
 * new PII field on User) does not automatically leak here, because this
 * function doesn't derive from that one at all.
 */
function toPublicMinimalProfile(user, rank) {
  return {
    username: user.username,
    full_name: user.fullName,
    college: user.college,
    handshake_count: user.handshakeCount,
    rank,
  };
}

module.exports = { getRank, toPublicProfile, toPublicMinimalProfile };
