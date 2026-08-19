const prisma = require('../src/db/client');

async function resetDb() {
  const preserveAdmin = process.argv.includes('--preserve-admin');

  console.log(
    preserveAdmin
      ? '🔄 Starting Database Reset (preserving admin accounts)...'
      : '🔥 Starting FULL Database Reset (INCLUDING admin accounts)...'
  );

  try {
    // Delete tables in foreign-key safe order sequentially
    await prisma.handshake.deleteMany({});
    await prisma.handshakeCode.deleteMany({});
    await prisma.adminAction.deleteMany({});
    await prisma.handshakeLog.deleteMany({});

    if (preserveAdmin) {
      await prisma.user.deleteMany({ where: { isAdmin: false } });
      await prisma.user.updateMany({
        where: { isAdmin: true },
        data: { handshakeCount: 0, lastVerifiedHandshakeAt: null },
      });
    } else {
      await prisma.user.deleteMany({});
    }

    console.log(
      preserveAdmin
        ? '✅ Database reset successfully! Non-admin data removed; Admin accounts preserved.'
        : '🔥 Database completely reset! ALL tables and accounts (including admins) have been cleared.'
    );
  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetDb();
