const { logActivity } = require('./activityLog');

/** Log ERP admin mutations to activity_logs */
function logErp(req, action, entityType, entityId, details) {
  return logActivity({
    userId: req.user?.id,
    action,
    entityType,
    entityId,
    details,
    ip: req.ip,
  });
}

module.exports = { logErp };
