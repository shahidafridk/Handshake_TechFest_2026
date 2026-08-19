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
    logger.info('Ensuring 3 default admin accounts exist in database...');
    for (const admin of DEFAULT_ADMINS) {
      const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);
      await prisma.user.upsert({
        where: { username: admin.username },
        update: {
          passwordHash,
          isAdmin: true,
          isActive: true,
        },
        create: {
          username: admin.username,
          fullName: admin.fullName,
          college: 'St. Marys Organizing Committee',
          passwordHash,
          isAdmin: true,
          isActive: true,
        },
      });
    }
    logger.info('✅ 3 Admin accounts (admin1, admin2, admin3) are ready.');
  } catch (err) {
    logger.error({ err }, 'Failed to bootstrap admin accounts during startup');
  }
}

module.exports = bootstrapAdmins;
