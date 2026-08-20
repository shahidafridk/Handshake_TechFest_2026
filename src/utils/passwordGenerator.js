// Generates a random temporary password for a newly-imported participant.
// crypto.randomInt, not Math.random() — same reasoning as codeGenerator.js:
// this backs a real credential, however temporary, and must be
// cryptographically secure.

const crypto = require('crypto');

// Mixed case + digits, no symbols — organizers may need to read these
// aloud or relay them via SMS/email; ambiguous-to-type symbols aren't worth
// the marginal entropy gain at this length. No character exclusions beyond
// that (unlike handshake codes, these aren't read off a phone screen
// mid-conversation, so 0/O and 1/I ambiguity matters less here).
const PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
const PASSWORD_LENGTH = 6;

function generateSecurePassword(length = PASSWORD_LENGTH) {
  let password = '';
  for (let i = 0; i < length; i++) {
    password += PASSWORD_CHARSET[crypto.randomInt(0, PASSWORD_CHARSET.length)];
  }
  return password;
}

module.exports = { generateSecurePassword };
