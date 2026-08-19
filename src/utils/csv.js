const { parse } = require('csv-parse/sync');

// Google Forms exports rarely use exactly the column names our schema
// expects — this maps a handful of reasonable real-world header variants to
// the canonical field names the rest of the import pipeline uses. An
// unrecognized header is silently ignored (not an error) — extra columns
// in a form export (timestamp, consent checkboxes, etc.) are expected and
// harmless.
const HEADER_ALIASES = {
  name: 'fullName',
  fullname: 'fullName',
  'full name': 'fullName',

  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  contact: 'phone',

  college: 'college',
  'college name': 'college',
  institution: 'college',

  department: 'department',
  dept: 'department',
  branch: 'department',

  year: 'year',
  'year of study': 'year',
};

function normalizeHeaderKey(rawKey) {
  return HEADER_ALIASES[rawKey.trim().toLowerCase()] || null;
}

/**
 * Parses raw CSV text into an array of row objects with canonical field
 * names (fullName, email, college, department, year) — NOT yet validated;
 * that's the caller's job via csvRowSchema, which should treat everything
 * here as untrusted input.
 */
function parseParticipantCsv(csvText) {
  const rawRows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // Excel/Google Sheets exports often include a UTF-8 BOM
  });

  return rawRows.map((rawRow) => {
    const normalized = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const canonical = normalizeHeaderKey(key);
      if (canonical) normalized[canonical] = value;
    }
    return normalized;
  });
}

function escapeCsvField(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {Array<{full_name: string, college: string, username: string, password: string}>} credentials
 */
function credentialsToCsv(credentials) {
  const header = 'Name,College,Username,Temporary Password';
  const rows = credentials.map((c) =>
    [c.full_name, c.college, c.username, c.password].map(escapeCsvField).join(',')
  );
  return [header, ...rows].join('\n');
}

module.exports = { parseParticipantCsv, credentialsToCsv };
