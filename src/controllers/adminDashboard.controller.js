const adminDashboardService = require('../services/adminDashboard.service');
const { getAuditLogs } = require('../services/adminAudit.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');

const getDashboard = asyncHandler(async function getDashboard(req, res) {
  const data = await adminDashboardService.getOrganizerDashboard();
  sendSuccess(res, 200, 'Organizer dashboard retrieved.', data);
});

const listAuditLogs = asyncHandler(async function listAuditLogs(req, res) {
  const logs = await getAuditLogs();
  sendSuccess(res, 200, 'Audit logs retrieved.', { logs });
});

module.exports = { getDashboard, listAuditLogs };
