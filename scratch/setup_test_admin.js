const prisma = require('../src/db/client');
const bcrypt = require('bcrypt');

async function main() {
  console.log('--- Setting up Admin user for testing ---');
  const passwordHash = await bcrypt.hash('AdminTest123!', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'testadmin' },
    update: { passwordHash, isAdmin: true, isActive: true },
    create: {
      username: 'testadmin',
      fullName: 'Test Admin',
      email: 'testadmin@fest.local',
      college: 'TechFest HQ',
      passwordHash,
      isAdmin: true,
      isActive: true,
    },
  });
  console.log('Admin user ready:', admin.username);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
