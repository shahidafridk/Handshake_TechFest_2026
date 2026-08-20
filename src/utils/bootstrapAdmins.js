const prisma = require('../db/client');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../config/constants');
const logger = require('./logger');

const DEFAULT_ADMINS = [
  { username: 'admin1', fullName: 'St. Marys Admin 1', password: 'STMarys@admin1' },
  { username: 'admin2', fullName: 'St. Marys Admin 2', password: 'STMarys@admin2' },
  { username: 'admin3', fullName: 'St. Marys Admin 3', password: 'STMarys@admin3' },
];

async function bootstrapAdmins() {
  try {
    const existing = await prisma.user.findMany({
      where: { username: { in: DEFAULT_ADMINS.map((a) => a.username) } },
      select: { username: true },
    });

    const existingUsernames = new Set(existing.map((u) => u.username));

    for (const admin of DEFAULT_ADMINS) {
      if (!existingUsernames.has(admin.username)) {
        const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);
        await prisma.user.create({
          data: {
            username: admin.username,
            fullName: admin.fullName,
            college: 'St. Marys Organizing Committee',
            passwordHash,
            isAdmin: true,
            isActive: true,
          },
        });
      }
    }
    logger.info('✅ Default admin accounts initialized.');
  } catch (err) {
    logger.error({ err }, 'Admin bootstrap check completed.');
  }
}

module.exports = bootstrapAdmins;
