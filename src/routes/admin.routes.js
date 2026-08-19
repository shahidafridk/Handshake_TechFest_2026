const express = require('express');
const multer = require('multer');

const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const validate = require('../middleware/validate');

const participantsController = require('../controllers/adminParticipants.controller');
const importController = require('../controllers/adminImport.controller');
const dashboardController = require('../controllers/adminDashboard.controller');

const {
  participantQuerySchema,
  usernameParamSchema,
  exportQuerySchema,
  createParticipantSchema,
  updateParticipantSchema,
  resetPasswordSchema,
  checkUsernameQuerySchema,
} = require('../validators/admin.schema');

const router = express.Router();

// Every admin route requires a logged-in admin — enforced once here rather
// than per-route, so a future route added to this file can't accidentally
// be left unprotected.
router.use(authenticate, requireAdmin);

// Memory storage, not disk — the file only needs to exist long enough to
// read its text and parse it; nothing about a CSV upload needs to touch
// disk on this server.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — generous for a text CSV of hundreds of rows
});

router.get('/participants', validate(participantQuerySchema, 'query'), participantsController.list);
router.get('/participants/check-username', validate(checkUsernameQuerySchema, 'query'), participantsController.checkUsername);
router.post('/participants', validate(createParticipantSchema), participantsController.create);
router.put(
  '/participants/:username',
  validate(usernameParamSchema, 'params'),
  validate(updateParticipantSchema),
  participantsController.update
);
router.put(
  '/participants/:username/activate',
  validate(usernameParamSchema, 'params'),
  participantsController.activate
);
router.put(
  '/participants/:username/deactivate',
  validate(usernameParamSchema, 'params'),
  participantsController.deactivate
);
router.put(
  '/participants/:username/reset-password',
  validate(usernameParamSchema, 'params'),
  validate(resetPasswordSchema),
  participantsController.resetPassword
);
router.delete(
  '/participants/:username',
  validate(usernameParamSchema, 'params'),
  participantsController.remove
);

router.post('/import', upload.single('file'), importController.importCsv);
router.get('/credentials/export', validate(exportQuerySchema, 'query'), importController.exportCredentials);

router.get('/dashboard', dashboardController.getDashboard);
router.get('/audit-logs', dashboardController.listAuditLogs);

module.exports = router;
