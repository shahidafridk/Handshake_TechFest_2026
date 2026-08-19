const adminParticipantService = require('../services/adminParticipant.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const list = asyncHandler(async function list(req, res) {
  const data = await adminParticipantService.listParticipants(req.query);
  sendSuccess(res, 200, 'Participants retrieved.', data);
});

const activate = asyncHandler(async function activate(req, res) {
  const participant = await adminParticipantService.setParticipantActive(
    req.params.username,
    true,
    req.user.id
  );
  sendSuccess(res, 200, 'Participant activated.', { participant });
});

const deactivate = asyncHandler(async function deactivate(req, res) {
  const participant = await adminParticipantService.setParticipantActive(
    req.params.username,
    false,
    req.user.id
  );
  sendSuccess(res, 200, 'Participant deactivated.', { participant });
});

const resetPassword = asyncHandler(async function resetPassword(req, res) {
  const result = await adminParticipantService.resetParticipantPassword(
    req.params.username,
    req.body?.password,
    req.user.id
  );
  sendSuccess(
    res,
    200,
    'Password updated successfully.',
    result
  );
});

const create = asyncHandler(async function create(req, res) {
  const result = await adminParticipantService.createParticipant(req.body, req.user.id);
  sendSuccess(res, 201, 'Participant account created successfully.', result);
});

const remove = asyncHandler(async function remove(req, res) {
  const result = await adminParticipantService.deleteParticipant(req.params.username, req.user.id);
  sendSuccess(res, 200, 'Participant account deleted successfully.', result);
});

const checkUsername = asyncHandler(async function checkUsername(req, res) {
  const result = await adminParticipantService.checkUsernameAvailability(req.query);
  sendSuccess(res, 200, 'Username check complete.', result);
});

const update = asyncHandler(async function update(req, res) {
  const result = await adminParticipantService.updateParticipant(req.params.username, req.body, req.user.id);
  sendSuccess(res, 200, 'Participant account updated successfully.', result);
});

module.exports = { list, activate, deactivate, resetPassword, create, remove, checkUsername, update };
