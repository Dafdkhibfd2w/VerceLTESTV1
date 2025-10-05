const ActivityLog = require('../models/ActivityLog.js');

async function log(req, action, target = {}, meta = {}) {
  try {
    const tenantId = req?.user?.TenantID || target?.tenant;
    if (!tenantId || !action) return;

    await ActivityLog.create({
      tenant: tenantId,
      actor: req?.user?._id || null,
      actorName: req?.user?.name || null,
      actorEmail: req?.user?.email || null,
      action,
      target,
      meta,
      ip: req?.headers?.['x-forwarded-for']?.split(',')[0] || req?.ip,
      ua: req?.headers?.['user-agent'] || ''
    });
  } catch (e) {
    console.error('log() error:', e.message);
  }
}

module.exports = { log };