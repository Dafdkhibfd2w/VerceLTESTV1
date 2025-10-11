const express = require("express");
const { authenticateUser, isPlatformAdmin, requireTeamAccess } = require("../middlewares/auth");
const Tenant = require("../models/Tenant");
const User = require("../models/user");

const router = express.Router();

function plainFeatures(f) {
  if (!f) return {};
  if (f instanceof Map) return Object.fromEntries(f);
  if (typeof f === 'object') return f;
  return {};
}

router.get('/tenant/info', authenticateUser, async (req, res) => {
  try {
    const user   = req.user;
    const tenant = await Tenant.findById(user.TenantID).lean();
    if (!tenant) return res.status(404).json({ ok:false, message:'עסק לא נמצא' });

    const FEATURE_CATALOG = require("../config/featureCatalog");
    const featureState = Object.fromEntries(Object.keys(FEATURE_CATALOG || {}).map(k => [k, !!(tenant.features && tenant.features.get && tenant.features.get(k))]));

    const teamMembers = await User.find({ TenantID: tenant._id }).select('name email role memberships').lean();
    const owner = teamMembers.find(m => m.memberships?.some(mem => String(mem.tenant) === String(tenant._id) && mem.role === 'owner')) || null;

    res.json({
      ok: true,
      tenant: { id: tenant._id, name: tenant.name, createdAt: tenant.createdAt, settings: tenant.settings, features: plainFeatures(tenant.features) },
      featureState,
      currentUser: { id: user._id, name: user.name, email: user.email, role: user.memberships?.find(m => String(m.tenant) === String(tenant._id))?.role || 'staff' },
      owner: owner ? { name: owner.name, email: owner.email } : null,
      teamMembers: teamMembers.map(m => ({ id: m._id, name: m.name, email: m.email, role: m.memberships?.find(mm => String(mm.tenant) === String(tenant._id))?.role || 'staff' }))
    });
  } catch (e) { console.error('tenant/info error:', e); res.status(500).json({ ok:false, message:'שגיאה בטעינת נתוני העסק' }); }
});

router.get("/admin/tenants", requireTeamAccess, async (req, res) => {
  const tenants = await Tenant.find({}).select("name createdAt owner settings features")
    .populate({ path:"owner", select:"name email" }).lean();
  res.json({ ok:true, tenants: tenants.map(t => ({ id:String(t._id), name:t.name, createdAt:t.createdAt, owner: t.owner ? { name:t.owner.name, email:t.owner.email } : null, settings:t.settings || {}, features: t.features || {} }))});
});

router.put("/tenant/update", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const { name, settings } = req.body || {};
    const membership = user.memberships?.find(m => String(m.tenant) === String(user.TenantID));
    if (!membership || !['owner','admin'].includes(membership.role))
      return res.status(403).json({ ok:false, message:"אין הרשאה לעדכן פרטי העסק" });
    const tenant = await Tenant.findById(user.TenantID);
    if (!tenant) return res.status(404).json({ ok:false, message:"עסק לא נמצא" });
    if (name) tenant.name = String(name).trim();
    if (settings) tenant.settings = { ...tenant.settings, ...settings };
    await tenant.save();
    res.json({ ok:true, message:"העסק עודכן בהצלחה", tenant:{ id:tenant._id, name:tenant.name, settings:tenant.settings }});
  } catch (err) { console.error("tenant/update error:", err); res.status(500).json({ ok:false, message:"שגיאה בעדכון העסק" }); }
});

module.exports = router;
