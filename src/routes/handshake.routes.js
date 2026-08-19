const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const controller = require('../controllers/handshake.controller');
const { verifyCodeRateLimit, generateCodeRateLimit } = require('../middleware/rateLimit');
const { verifyCodeSchema } = require('../validators/handshake.schema');

// Direct handshaking: share a code, enter it, then verify once.
router.get('/', authenticate, controller.list);
router.post('/generate-code', authenticate, generateCodeRateLimit, controller.generate);
router.post('/connect', authenticate, verifyCodeRateLimit, validate(verifyCodeSchema), controller.verify);

module.exports = router;
