const crypto = require('crypto');

function generateSecurePassword(fullName = '') {
  const cleanStr = (fullName || '').trim();
  const words = cleanStr.split(/\s+/).filter(Boolean);

  let chosenWord = '';

  if (words.length >= 2) {
    const secondWordClean = words[1].replace(/[^a-zA-Z0-9]/g, '');
    if (secondWordClean.length >= 3) {
      chosenWord = secondWordClean;
    } else {
      chosenWord = words[0].replace(/[^a-zA-Z0-9]/g, '');
    }
  } else if (words.length === 1) {
    chosenWord = words[0].replace(/[^a-zA-Z0-9]/g, '');
  }

  if (!chosenWord || chosenWord.length === 0) {
    chosenWord = 'User';
  }

  chosenWord = chosenWord.charAt(0).toUpperCase() + chosenWord.slice(1);
  const random4Digit = crypto.randomInt(1000, 10000);

  return `${chosenWord}@${random4Digit}`;
}

module.exports = { generateSecurePassword };
