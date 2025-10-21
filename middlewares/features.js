const Tenant = require("../models/Tenant");

function featureOn(features, key) {
  if (!features) return false;
  if (typeof features.get === 'function') return !!features.get(key);
  return !!features[key];
}
function featuresToPlain(features) {
  if (!features) return {};
  if (typeof features.get === 'function') return Object.fromEntries(features);
  return { ...features };
}
const requireTenantFeature = (feature) => async (req, res, next) => {
  try {
    const t = await Tenant.findById(req.user.TenantID).select('features');
    const on = featureOn(t?.features, feature);
    if (!on) return res.status(403).json({ ok:false, message:'הפיצ׳ר לא פעיל לעסק זה' });
    next();
  } catch (e) {
    console.error('requireTenantFeature error:', e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
};

module.exports = { featureOn, featuresToPlain, requireTenantFeature };
