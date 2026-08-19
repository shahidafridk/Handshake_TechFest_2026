const prisma = require('../src/db/client');
const bcrypt = require('bcrypt');
const { BCRYPT_ROUNDS } = require('../src/config/constants');

const ADMINS = [
  { username: 'admin1', fullName: 'St. Marys Admin 1', password: 'STMarys@admin1' },
  { username: 'admin2', fullName: 'St. Marys Admin 2', password: 'STMarys@admin2' },
  { username: 'admin3', fullName: 'St. Marys Admin 3', password: 'STMarys@admin3' },
];

async function seedAdmins() {
  console.log('🌱 Provisioning 3 Admin Accounts...');

  for (const admin of ADMINS) {
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
    console.log(`  ✅ Admin @${admin.username} ready.`);
  }

  console.log('✨ All 3 Admin Accounts Provisioned Successfully!');
}

seedAdmins()
  .catch((err) => {
    console.error('❌ Failed to seed admins:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
