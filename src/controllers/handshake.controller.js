// Thin by design — parses the request, calls one service function, shapes
// the response. All business logic (including audit logging) lives in the
// services this delegates to.

const handshakeCodeService = require('../services/handshakeCode.service');
const handshakeService = require('../services/handshake.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

function codeResponsePayload(codeRow) {
  return {
    code: codeRow.code,
    expires_at: codeRow.expiresAt,
    expires_in_seconds: Math.max(0, Math.round((codeRow.expiresAt.getTime() - Date.now()) / 1000)),
  };
}

const generate = asyncHandler(async function generate(req, res) {
  const codeRow = await handshakeCodeService.getOrCreateActiveCode(req.user.id, req.ip);
  sendSuccess(res, 200, 'Handshake code ready.', codeResponsePayload(codeRow));
});

const verify = asyncHandler(async function verify(req, res) {
  const { code } = req.body;
  const { handshake, initiator, responder } = await handshakeService.verifyCode(
    code,
    req.user.id,
    req.ip
  );

  sendSuccess(res, 200, 'Handshake connected successfully!', {
    // Retains the fields consumed by the existing frontend.
    id: initiator.id,
    full_name: initiator.fullName,
    username: initiator.username,
    // Additional authoritative result data is backward-compatible.
    handshake_id: handshake.id,
    connected_with: { full_name: initiator.fullName, college: initiator.college },
    new_handshake_count: responder.handshakeCount,
  });
});

const list = asyncHandler(async function list(req, res) {
  const recent = await handshakeService.getRecentForHandshakeList(req.user.id);

  // Preserve the current dashboard contract. Direct handshaking has no
  // pending/accept/reject workflow, so this array remains intentionally empty.
  res.status(200).json({ success: true, data: { pending: [], recent } });
});

const myCode = asyncHandler(async function myCode(req, res) {
  const codeRow = await handshakeCodeService.getActiveCode(req.user.id);

  if (!codeRow) {
    return sendSuccess(res, 200, 'No active handshake code.', { code: null });
  }
  sendSuccess(res, 200, 'Active handshake code retrieved.', codeResponsePayload(codeRow));
});

const history = asyncHandler(async function history(req, res) {
  const { limit } = req.query;
  const handshakes = await handshakeService.getHistory(req.user.id, limit);
  sendSuccess(res, 200, 'Handshake history retrieved.', { handshakes });
});

module.exports = { generate, verify, list, myCode, history };
