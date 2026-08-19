// Participant listing, search/filter, activation, and password reset.
// Deliberately excludes admin accounts from every query here (`isAdmin:
// false`) — this module manages participants, not other organizers.

const bcrypt = require('bcrypt');
const prisma = require('../db/client');
const AppError = require('../utils/AppError');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { generateUniqueUsername } = require('../utils/usernameGenerator');
const { BCRYPT_ROUNDS } = require('../config/constants');
const { logAdminAction } = require('./adminAudit.service');

// Explicit allowlist, and enforced at the query level via `select` (not
// fetched-then-omitted) — passwordHash and id are never even pulled from
// the database for this view, let alone returned.
const ADMIN_PARTICIPANT_SELECT = {
  username: true,
  fullName: true,
  phone: true,
  college: true,
  department: true,
  year: true,
  handshakeCount: true,
  isActive: true,
  createdAt: true,
};

function toAdminParticipantView(user) {
  return {
    username: user.username,
    full_name: user.fullName,
    phone: user.phone,
    college: user.college,
    department: user.department,
    year: user.year,
    handshake_count: user.handshakeCount,
    is_active: user.isActive,
    created_at: user.createdAt,
  };
}

async function listParticipants({ page = 1, limit = 10, q, college, minHandshakes, maxHandshakes } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const where = { isAdmin: false };

  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { username: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (college) {
    where.college = { equals: college, mode: 'insensitive' };
  }
  if (minHandshakes !== undefined || maxHandshakes !== undefined) {
    where.handshakeCount = {};
    if (minHandshakes !== undefined) where.handshakeCount.gte = Number(minHandshakes);
    if (maxHandshakes !== undefined) where.handshakeCount.lte = Number(maxHandshakes);
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum,
      select: ADMIN_PARTICIPANT_SELECT,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    participants: rows.map(toAdminParticipantView),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

async function findParticipantOrThrow(username) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.isAdmin) {
    throw new AppError('PARTICIPANT_NOT_FOUND', 'Participant not found.', 404);
  }
  return user;
}

async function setParticipantActive(username, isActive, adminId) {
  const user = await findParticipantOrThrow(username);

  const updated = await prisma.user.update({
    where: { username },
    data: { isActive },
    select: ADMIN_PARTICIPANT_SELECT,
  });

  await logAdminAction({
    adminId,
    action: isActive ? 'reactivate' : 'deactivate',
    targetUserId: user.id, // internal audit trail only — never returned via the API
  });

  return toAdminParticipantView(updated);
}

async function resetParticipantPassword(username, customPassword, adminId) {
  const user = await findParticipantOrThrow(username);

  const newPassword = (customPassword && typeof customPassword === 'string' && customPassword.trim()) 
    ? customPassword.trim() 
    : generateSecurePassword();
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.user.update({ where: { username }, data: { passwordHash } });

  await logAdminAction({ adminId, action: 'reset_password', targetUserId: user.id });

  return { username, new_password: newPassword };
}

async function createParticipant(data, adminId) {
  const { fullName, phone, college, department, year, username, password } = data;

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    throw new AppError('DUPLICATE_USERNAME', 'A participant with this username already exists.', 409);
  }

  if (phone) {
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) {
      throw new AppError('DUPLICATE_PHONE', 'A participant with this phone number already exists.', 409);
    }
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      fullName,
      college: college || 'TechFest 2026',
      department: department || null,
      year: year || null,
      phone: phone || null,
      isAdmin: false,
      isActive: true,
    },
    select: {
      ...ADMIN_PARTICIPANT_SELECT,
      id: true,
    },
  });

  await logAdminAction({
    adminId,
    action: 'create_participant',
    targetUserId: user.id,
    metadata: { username: user.username, phone: user.phone },
  });

  return {
    participant: toAdminParticipantView(user),
    initial_password: password,
  };
}

async function deleteParticipant(username, adminId) {
  const user = await findParticipantOrThrow(username);

  await prisma.$transaction([
    prisma.handshake.deleteMany({
      where: {
        OR: [{ initiatorId: user.id }, { responderId: user.id }],
      },
    }),
    prisma.handshakeCode.deleteMany({
      where: { ownerId: user.id },
    }),
    prisma.adminAction.deleteMany({
      where: { targetUserId: user.id },
    }),
    prisma.user.delete({
      where: { id: user.id },
    }),
  ]);

  await logAdminAction({
    adminId,
    action: 'delete_participant',
    targetUserId: null,
    metadata: { deleted_username: username },
  });

  return { username };
}

async function checkUsernameAvailability({ username, excludeUsername }) {
  if (!username) return { available: false, username: '' };

  const where = {
    username: { equals: username, mode: 'insensitive' },
  };

  if (excludeUsername) {
    where.NOT = { username: { equals: excludeUsername, mode: 'insensitive' } };
  }

  const existing = await prisma.user.findFirst({ where });
  return {
    available: !existing,
    username,
  };
}

async function updateParticipant(currentUsername, updateData, adminId) {
  const user = await findParticipantOrThrow(currentUsername);

  const { fullName, username, phone, college, department, password } = updateData;

  // Check username collision if username is being changed
  if (username && username.toLowerCase() !== currentUsername.toLowerCase()) {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      throw new AppError('DUPLICATE_USERNAME', 'A participant with this username already exists.', 409);
    }
  }

  // Check phone collision if phone is being changed
  if (phone) {
    const existingPhone = await prisma.user.findFirst({
      where: {
        phone,
        NOT: { id: user.id },
      },
    });
    if (existingPhone) {
      throw new AppError('DUPLICATE_PHONE', 'A participant with this phone number already exists.', 409);
    }
  }

  const dataToUpdate = {};
  if (fullName !== undefined) dataToUpdate.fullName = fullName;
  if (username !== undefined) dataToUpdate.username = username;
  if (phone !== undefined) dataToUpdate.phone = phone || null;
  if (college !== undefined) dataToUpdate.college = college || 'TechFest 2026';
  if (department !== undefined) dataToUpdate.department = department || null;

  if (password) {
    dataToUpdate.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: dataToUpdate,
    select: ADMIN_PARTICIPANT_SELECT,
  });

  await logAdminAction({
    adminId,
    action: 'update_participant',
    targetUserId: user.id,
    metadata: {
      previous_username: currentUsername,
      updated_username: updatedUser.username,
      password_reset: Boolean(password),
    },
  });

  return {
    participant: toAdminParticipantView(updatedUser),
    password_updated: Boolean(password),
  };
}

module.exports = {
  listParticipants,
  setParticipantActive,
  resetParticipantPassword,
  createParticipant,
  deleteParticipant,
  checkUsernameAvailability,
  updateParticipant,
};
