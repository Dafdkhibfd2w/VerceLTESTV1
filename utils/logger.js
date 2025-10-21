const ActivityLog = require("../models/ActivityLog");

async function log(req, action, target = {}, meta = {}) {
  try {
    await ActivityLog.create({
      tenant: req.user?.TenantID || req.auth?.TenantID || null,
      action,
      actor: req.user?._id || null,
      actorName: req.user?.name || "",
      actorEmail: req.user?.email || "",
      target,
      meta
    });
  } catch (e) {
    console.warn("activity log failed:", e.message);
  }
}
module.exports = { log };
