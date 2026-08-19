// Handshake.sh — database seed script
//
// Idempotent: uses `upsert` keyed on unique fields (username/email) so
// re-running this during local development never crashes on a duplicate
// key. Safe to run repeatedly against the same database.
//
// Development seeds use the configured bcrypt cost and an explicit password;
// remote development databases require a separate, deliberate opt-in.
const bcrypt = require('bcrypt');
const { sortPair } = require('../src/utils/sortPair');
const prisma = require('../src/db/client');
const env = require('../src/config/env');
const { BCRYPT_ROUNDS } = require('../src/config/constants');

const SEED_PASSWORD = process.env.SEED_PASSWORD;
const SEED_ALLOW_REMOTE = process.env.SEED_ALLOW_REMOTE === 'true';

const PARTICIPANTS = [
  { username: 'yadu24', fullName: 'Yadu Krishnan', college: 'IIT Bombay', department: 'Computer Science', year: 3, email: 'yadu24@example.edu' },
  { username: 'arya07', fullName: 'Arya Menon', college: 'BITS Pilani', department: 'Electronics', year: 2, email: 'arya07@example.edu' },
  { username: 'rahul12', fullName: 'Rahul Verma', college: 'VIT Vellore', department: 'Computer Science', year: 4, email: 'rahul12@example.edu' },
  { username: 'meera19', fullName: 'Meera Nair', college: 'NIT Trichy', department: 'Mechanical', year: 2, email: 'meera19@example.edu' },
  { username: 'devika03', fullName: 'Devika Rao', college: 'IIIT Hyderabad', department: 'Computer Science', year: 3, email: 'devika03@example.edu' },
  { username: 'nikhil88', fullName: 'Nikhil Singh', college: 'Manipal Institute', department: 'Information Technology', year: 1, email: 'nikhil88@example.edu' },
  { username: 'priya21', fullName: 'Priya Sharma', college: 'IIT Delhi', department: 'Design', year: 4, email: 'priya21@example.edu' },
  { username: 'farhan15', fullName: 'Farhan Ali', college: 'SRM Chennai', department: 'Computer Science', year: 2, email: 'farhan15@example.edu' },
  { username: 'tara09', fullName: 'Tara Joseph', college: 'IIT Bombay', department: 'Civil', year: 3, email: 'tara09@example.edu' },
];

async function upsertUser(data, overrides = {}) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);
  return prisma.user.upsert({
    where: { username: data.username },
    update: {},
    create: {
      ...data,
      passwordHash,
      ...overrides,
    },
  });
}

async function main() {
  if (env.NODE_ENV !== 'development') {
    throw new Error('Seeding is permitted only when NODE_ENV=development.');
  }

  if (!SEED_PASSWORD) {
    throw new Error('Seeding requires an explicit SEED_PASSWORD.');
  }

  let databaseHost;
  try {
    databaseHost = new URL(process.env.DATABASE_URL).hostname;
  } catch {
    throw new Error('Seeding requires a valid database connection URL.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const isLocalDatabase = localHosts.has(databaseHost);

  if (!isLocalDatabase && !SEED_ALLOW_REMOTE) {
    throw new Error(
      'Remote development seeding requires explicit SEED_ALLOW_REMOTE=true.'
    );
  }

  if (!isLocalDatabase) {
    console.log('Remote development seeding explicitly enabled.');
  }

  console.log('Seeding admin user...');
  const admin = await upsertUser(
    { username: 'admin', fullName: 'Event Admin', college: 'Organizing Committee', email: 'admin@handshake.sh' },
    { isAdmin: true }
  );

  console.log('Seeding participants...');
  const users = {};
  for (const p of PARTICIPANTS) {
    users[p.username] = await upsertUser(p);
  }

  console.log('Seeding handshake codes...');

  // Active code — still valid, nobody has used it yet.
  await prisma.handshakeCode.upsert({
    where: { id: 'seed-code-active-yadu24' },
    update: {},
    create: {
      id: 'seed-code-active-yadu24',
      code: 'AB7XK2',
      ownerId: users.yadu24.id,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from seed run time
    },
  });

  // Expired, never-used code — exercises the CODE_EXPIRED path in testing.
  await prisma.handshakeCode.upsert({
    where: { id: 'seed-code-expired-arya07' },
    update: {},
    create: {
      id: 'seed-code-expired-arya07',
      code: 'PQ9RT4',
      ownerId: users.arya07.id,
      expiresAt: new Date(Date.now() - 10 * 60 * 1000), // expired 10 minutes ago
    },
  });

  console.log('Seeding verified handshakes...');

  // Each pair below: one side generates+uses a code, both sides' handshakeCount
  // increments by 1, matching what the real verify-code transaction will do.
  const verifiedPairs = [
    { initiator: 'rahul12', responder: 'meera19', code: 'MN4VXQ', codeId: 'seed-code-used-rahul12' },
    { initiator: 'devika03', responder: 'nikhil88', code: 'ZT8HDN', codeId: 'seed-code-used-devika03' },
    { initiator: 'priya21', responder: 'farhan15', code: 'QW6YXM', codeId: 'seed-code-used-priya21' },
  ];

  for (const pair of verifiedPairs) {
    const initiator = users[pair.initiator];
    const responder = users[pair.responder];

    const usedCode = await prisma.handshakeCode.upsert({
      where: { id: pair.codeId },
      update: {},
      create: {
        id: pair.codeId,
        code: pair.code,
        ownerId: initiator.id,
        expiresAt: new Date(Date.now() - 60 * 1000), // already past its window
        usedAt: new Date(),
      },
    });

    const [userLowId, userHighId] = sortPair(initiator.id, responder.id);

    const existing = await prisma.handshake.findUnique({
      where: { userLowId_userHighId: { userLowId, userHighId } },
    });

    if (!existing) {
      const connectedAt = new Date();

      await prisma.handshake.create({
        data: {
          initiatorId: initiator.id,
          responderId: responder.id,
          userLowId,
          userHighId,
          codeId: usedCode.id,
          createdAt: connectedAt,
        },
      });

      await prisma.user.update({
        where: { id: initiator.id },
        data: { handshakeCount: { increment: 1 }, lastVerifiedHandshakeAt: connectedAt },
      });
      await prisma.user.update({
        where: { id: responder.id },
        data: { handshakeCount: { increment: 1 }, lastVerifiedHandshakeAt: connectedAt },
      });
    }
  }

  console.log('Seeding one admin audit log entry...');
  await prisma.adminAction.upsert({
    where: { id: 'seed-admin-action-import' },
    update: {},
    create: {
      id: 'seed-admin-action-import',
      adminId: admin.id,
      action: 'import',
      metadata: { imported_count: PARTICIPANTS.length, source: 'seed script' },
    },
  });

  console.log('Seed complete.');
  console.log(`  ${PARTICIPANTS.length + 1} users (including 1 admin)`);
  console.log(`  ${verifiedPairs.length} verified handshakes`);
  console.log('  1 active code, 1 expired-unused code, 3 used codes');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
