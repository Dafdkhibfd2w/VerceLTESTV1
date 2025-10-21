const jwt = require("jsonwebtoken");
const { COOKIE_OPTIONS } = require("../config/cookie");
const User = require("../models/user");
const Tenant = require("../models/Tenant");

const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function signAuthCookie(res, { userId, tenantId, role }) {
  const payload = { id: String(userId), TenantID: tenantId ? String(tenantId) : undefined, role };
  const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
  res.cookie("token", token, COOKIE_OPTIONS);
  return token;
}

async function loadUserFromToken(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  const dec = jwt.verify(token, SECRET);
  const user = await User.findById(dec.id).lean();
  if (!user) return null;
  return { decoded: dec, user };
}

const authenticateUser = async (req, res, next) => {
  try {
    const pack = await loadUserFromToken(req);
    if (!pack) return res.redirect("/login");
    req.user = pack.user;
    req.auth = pack.decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ ok:false, message:"Unauthorized" });
  }
};

function requireAuthPage(req, res, next) {
  loadUserFromToken(req)
    .then(pack => pack ? next() : res.redirect("/login"))
    .catch(() => res.redirect("/login"));
}

function getRoleForTenant(userDoc, tenantId) {
  try {
    return (userDoc?.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role || null;
  } catch { return null; }
}
function roleHomeFor(user) {
  const role = getRoleForTenant(user, user.TenantID);
  return ['owner','manager','shift_manager'].includes(role) ? '/manager' : '/worker';
}
function requireRoles(roles = []) {
  return (req, res, next) => {
    const tenantId = req.user?.TenantID;
    if (!tenantId) return res.status(401).json({ ok:false, message: 'Unauthorized' });
    const role = getRoleForTenant(req.user, tenantId);
    if (!role || !roles.includes(role)) {
      if (req.accepts('html')) return res.redirect('/worker');
      return res.status(403).json({ ok:false, message: 'Forbidden' });
    }
    next();
  };
}

const PLATFORM_ADMINS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
function isPlatformAdmin(user) {
  const email = (user.email || "").toLowerCase();
  return user.platformRole === "admin" || PLATFORM_ADMINS.includes(email);
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || "my-super-secret";
function requireTeamAccess(req, res, next) {
  const token = req.headers["x-team-token"] || req.query.token;
  if (token !== ADMIN_SECRET) return res.status(403).json({ ok:false, message:"Access denied" });
  next();
}
function requireTeamManager(req, res, next) {
  const tenantId = req.user.TenantID;
  const myRole   = getRoleForTenant(req.user, tenantId);
  if (!myRole || !['owner'].includes(myRole)) {
    return res.status(403).json({ ok:false, message:'אין לך הרשאה לניהול צוות' });
  }
  next();
}

module.exports = {
  signAuthCookie,
  loadUserFromToken,
  authenticateUser,
  requireAuthPage,
  requireRoles,
  getRoleForTenant,
  roleHomeFor,
  isPlatformAdmin,
  requireTeamAccess,
  requireTeamManager
};
