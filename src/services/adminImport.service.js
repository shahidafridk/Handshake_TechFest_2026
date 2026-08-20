// The bulk-import pipeline: parse, validate every row independently, skip
// duplicates (both within the file and against existing accounts), create
// users, and hand back an ephemeral, one-time-downloadable credentials
// batch — never a database row containing plaintext.
//
// Rows are processed sequentially, not in parallel (Promise.all). Two
// reasons: bcrypt.hash is CPU-bound, and hashing hundreds of rows
// concurrently would spike the event loop for no benefit on a
// not-latency-critical background-ish operation; and the in-batch username
// reservation Set (usernameGenerator.js) needs rows processed one at a time
// to correctly catch a collision between two rows in the same file.

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const prisma = require('../db/client');
const AppError = require('../utils/AppError');
const { parseParticipantCsv } = require('../utils/csv');
const { csvRowSchema } = require('../validators/admin.schema');
const { generateUniqueUsername } = require('../utils/usernameGenerator');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { BCRYPT_ROUNDS } = require('../config/constants');
const credentialStore = require('../utils/ephemeralCredentialStore');
const { logAdminAction } = require('./adminAudit.service');

async function importParticipants(csvText, adminId) {
  let rawRows;
  try {
    rawRows = parseParticipantCsv(csvText);
  } catch (err) {
    throw new AppError('INVALID_CSV', 'Could not parse the uploaded file as CSV.', 400);
  }

  if (rawRows.length === 0) {
    throw new AppError('EMPTY_CSV', 'The uploaded CSV has no data rows.', 400);
  }

  let imported = 0;
  let duplicatePhones = 0;
  let invalidRows = 0;
  const seenPhonesInFile = new Set();
  const reservedUsernamesInBatch = new Set();
  const credentials = [];

  for (const rawRow of rawRows) {
    const parsed = csvRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      invalidRows++;
      continue;
    }
    const row = parsed.data;

    if (row.phone) {
      if (seenPhonesInFile.has(row.phone)) {
        duplicatePhones++;
        continue;
      }
      seenPhonesInFile.add(row.phone);

      const existing = await prisma.user.findUnique({ where: { phone: row.phone } });
      if (existing) {
        duplicatePhones++;
        continue;
      }
    }

    const username = await generateUniqueUsername(row.fullName, reservedUsernamesInBatch);
    const plaintextPassword = generateSecurePassword(row.fullName);
    const passwordHash = await bcrypt.hash(plaintextPassword, BCRYPT_ROUNDS);

    await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName: row.fullName,
        college: row.college,
        department: row.department,
        year: row.year,
        phone: row.phone || null,
      },
    });

    imported++;
    credentials.push({
      full_name: row.fullName,
      college: row.college,
      username,
      password: plaintextPassword,
    });
  }

  const batchId = crypto.randomUUID();
  if (credentials.length > 0) {
    credentialStore.put(batchId, credentials);
  }

  await logAdminAction({
    adminId,
    action: 'import',
    metadata: { imported, duplicate_phones: duplicatePhones, invalid_rows: invalidRows },
  });

  return {
    summary: {
      imported,
      skipped: duplicatePhones + invalidRows,
      duplicate_phones: duplicatePhones,
      invalid_rows: invalidRows,
    },
    // null when nothing was actually imported — nothing to export.
    batch_id: credentials.length > 0 ? batchId : null,
  };
}

async function exportCredentials(batchId, adminId) {
  const credentials = credentialStore.takeOnce(batchId);

  if (!credentials) {
    throw new AppError(
      'BATCH_NOT_FOUND',
      'This credential batch has expired or was already downloaded. Credentials can only be exported once, within 15 minutes of import.',
      404
    );
  }

  await logAdminAction({ adminId, action: 'export_credentials', metadata: { count: credentials.length } });

  return credentials;
}

module.exports = { importParticipants, exportCredentials };
