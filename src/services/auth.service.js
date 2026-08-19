const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../db/client');
const AppError = require('../utils/AppError');
const { JWT_SECRET, JWT_EXPIRY, BCRYPT_ROUNDS } = require('../config/constants');
const { toPublicProfile } = require('./user.service');

// Generated once with the configured work factor. This keeps the
// unknown-user path comparable to a real password comparison.
const dummyHashPromise = bcrypt.hash('handshake-timing-guard', BCRYPT_ROUNDS);

async function login(username, password) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    await bcrypt.compare(password, await dummyHashPromise);
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect username or password.', 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect username or password.', 401);
  }

  if (!user.isActive) {
    throw new AppError('ACCOUNT_DEACTIVATED', 'This account has been deactivated.', 403);
  }

  const token = jwt.sign(
    { sub: user.id, isAdmin: user.isAdmin },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_EXPIRY }
  );
  return {
    token,
    user: toPublicProfile(user, null),
  };
}

module.exports = { login };
