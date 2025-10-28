const express = require("express");
const { authenticateUser, getRoleForTenant, requireTeamManager, requireTeamAccess } = require("../middlewares/auth");
const { mailer } = require("../config/mailer");
const Tenant = require("../models/Tenant");
const User = require("../models/user");
const Invite = require("../models/Invite");
const { featuresToPlain } = require("../middlewares/features");
const { log } = require("../utils/logger");

const router = express.Router();

// Admin – feature catalog (static)
const FEATURE_CATALOG = require("../config/featureCatalog");
router.get('/admin/features-catalog', requireTeamAccess, (req, res) => {
  res.json({ ok:true, features: FEATURE_CATALOG });
});

router.post('/team/invite', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = getRoleForTenant(req.user, tenantId);
    if (!myRole || !['owner','manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה להזמין עובדים' });
    }

    let { email, role='employee', sendInvite=true } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    role  = String(role  || 'employee').toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok:false, message:'אימייל לא תקין' });
    if (!['owner','employee','shift_manager','manager'].includes(role)) role = 'employee';

    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) return res.status(404).json({ ok:false, message:'עסק לא נמצא' });

    const existing = await User.findOne({ email }).lean();
    if (existing?.memberships?.some(m => String(m.tenant) === String(tenantId))) {
      return res.status(409).json({ ok:false, message:'המשתמש כבר שייך לעסק' });
    }

    const token = require('crypto').randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000);

    await Invite.create({ tenant: tenantId, email, role, token, expiresAt, createdBy: req.user._id });

    const baseUrl = process.env.BASE_URL || 'localhost:4000';
    const inviteUrl = `${baseUrl}/login?invite=${encodeURIComponent(token)}`;

    if (sendInvite) {
      const subject = `הוזמנת להצטרף ל-${tenant.name} במערכת New Deli`;
      const text = `שלום,\n\nהוזמנת להצטרף ל-${tenant.name} במערכת New Deli.\nלהשלמת יצירה/הצטרפות לחשבון והגדרת סיסמה:\n${inviteUrl}\n\nהלינק תקף ל-7 ימים.`;
      const html = `<div>להשלמת ההרשמה: <a href="${inviteUrl}">פתח הזמנה</a></div>`;
try {
  await mailer.sendMail({
    from: `"New Deli" <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    text,
    html
  });
} catch (e) {
  console.error('invite mail failed:', e.message);
}
    }

    return res.json({ ok:true, token });
  } catch (e) { console.error('POST /team/invite', e); return res.status(500).json({ ok:false, message:'Server error' }); }
});

router.get('/team/invites', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = getRoleForTenant(req.user, tenantId) || 'employee';
    if (!['owner','manager'].includes(myRole)) return res.status(403).json({ ok:false, message:'אין הרשאה לצפות בהזמנות' });

    const invites = await Invite.find({ tenant: tenantId, expiresAt: { $gte: new Date() } })
      .sort({ createdAt: -1 }).select('_id email role token createdAt expiresAt').lean();

    return res.json({ ok:true, invites: invites.map(x => ({ id:String(x._id), email:x.email, role:x.role, createdAt:x.createdAt, expiresAt:x.expiresAt }))});
  } catch (e) { console.error('GET /team/invites', e); res.status(500).json({ ok:false, message:'Server error' }); }
});

router.delete('/team/invites/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = getRoleForTenant(req.user, tenantId);
    if (!['owner','manager'].includes(myRole)) return res.status(403).json({ ok:false, message:'אין הרשאה לבטל הזמנה' });

    const inv = await Invite.findById(req.params.id);
    if (!inv) return res.status(404).json({ ok:false, message:'הזמנה לא נמצאה' });
    if (String(inv.tenant) !== String(tenantId)) return res.status(403).json({ ok:false, message:'אין גישה להזמנה זו' });

    await Invite.deleteOne({ _id: inv._id });
    return res.json({ ok:true });
  } catch (e) { console.error('DELETE /team/invites/:id', e); res.status(500).json({ ok:false, message:'Server error' }); }
});

router.post('/team/invites/:id/resend', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = getRoleForTenant(req.user, tenantId);
    if (!['owner','manager'].includes(myRole)) return res.status(403).json({ ok:false, message:'אין הרשאה לשלוח מחדש' });

    const inv = await Invite.findById(req.params.id).populate('tenant', 'name').lean();
    if (!inv) return res.status(404).json({ ok:false, message:'הזמנה לא נמצאה' });
    if (String(inv.tenant._id) !== String(tenantId)) return res.status(403).json({ ok:false, message:'אין גישה להזמנה זו' });
    if (inv.expiresAt < new Date()) return res.status(400).json({ ok:false, message:'הזמנה פגה—צור חדשה' });

    const baseUrl = process.env.BASE_URL || 'https://your-app-url';
    const inviteUrl = `${baseUrl}/register.html?invite=${encodeURIComponent(inv.token)}`;
try {
  await mailer.sendMail({
    from: `"New Deli" <${process.env.SMTP_USER}>`,
    to: inv.email,
    subject: `תזכורת: הוזמנת להצטרף ל-${inv.tenant.name} במערכת New Deli`,
    html: `<a href="${inviteUrl}">פתח הזמנה</a>`
  });
} catch (e) {
  console.error('invite resend mail failed:', e.message);
}

    return res.json({ ok:true });
  } catch (e) { console.error('POST /team/invites/:id/resend', e); res.status(500).json({ ok:false, message:'Server error' }); }
});

router.post('/team/members', authenticateUser, async (req, res) => {
  let { name, email, role = 'employee', sendInvite = true } = req.body || {};
  email = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok:false, message:'Invalid email' });
  const tenantId = req.user.TenantID;
  const tenantName = req.user.TenantName;
  const baseUrl = process.env.BASE_URL || 'https://your-app-url';
  let user = await User.findOne({ email });
  if (user) {
    const alreadyMember = user.memberships?.some(m => String(m.tenant) === String(tenantId));
    if (alreadyMember) return res.status(409).json({ ok:false, message:'User already belongs to this tenant' });
    user.memberships.push({ tenant: tenantId, role });
    await user.save();
  } else {
    user = await User.create({ name, email, role, TenantID: tenantId, TenantName: tenantName, memberships: [{ tenant: tenantId, role }] });
    if (sendInvite) {
      const subject = `קיבלת גישה ל-${tenantName}`;
      const html = `<p>שלום ${name},</p><p>הוזמנת להצטרף ל-${tenantName} במערכת.</p><a href="${baseUrl}/register?email=${encodeURIComponent(email)}">כניסה להרשמה</a>`;
      await mailer.sendMail({ to: email, subject, html });
    }
  }
  return res.json({ ok: true, member: { id: user.id, name, email, role } });
});

router.put('/team/members/:id', authenticateUser, async (req, res) => {
  const tenantId = req.user.TenantID;
  const { id } = req.params;
  const { name, role, status } = req.body || {};
  const target = await User.findById(id);
  if (!target) return res.status(404).json({ ok:false, message:'משתמש לא נמצא' });
  const memIdx = (target.memberships || []).findIndex(m => String(m.tenant) === String(tenantId));
  if (memIdx === -1) return res.status(404).json({ ok:false, message:'לא שייך לעסק שלך' });
  if (name) target.name = name;
  if (role) target.memberships[memIdx].role = role;
  if (status) target.status = status;
  await target.save();
  res.json({ ok: true, message: 'עודכן בהצלחה' });
});

router.delete('/users/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId   = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });
    const myRole = getRoleForTenant(req.user, tenantId);
    if (!myRole || !['owner','manager'].includes(myRole)) return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק עובדים' });
    const { id } = req.params;
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ ok:false, message:'משתמש לא נמצא' });
    const memIdx = (target.memberships || []).findIndex(m => String(m.tenant) === String(tenantId));
    if (memIdx === -1) return res.status(404).json({ ok:false, message:'המשתמש אינו שייך לעסק זה' });
    const targetRole = target.memberships[memIdx].role;
    if (targetRole === 'owner') return res.status(403).json({ ok:false, message:'אסור למחוק בעל העסק' });
    if (myRole === 'manager' && targetRole === 'manager') return res.status(403).json({ ok:false, message:'מנהל לא יכול למחוק מנהל' });
    target.memberships.splice(memIdx, 1);
    if (!target.memberships.length) { target.TenantID = undefined; target.TenantName = undefined; }
    await target.save();
    res.json({ ok:true });
  } catch (e) { console.error('DELETE /users/:id', e); res.status(500).json({ ok:false, message:'Server error' }); }
});

router.get('/logs', authenticateUser, async (req, res) => {
  try {
    const myRole = getRoleForTenant(req.user, req.user.TenantID) || 'employee';
    if (!['owner','manager','shift_manager'].includes(myRole)) return res.status(403).json({ ok:false, message:'אין הרשאה לצפייה ביומן' });
    const ActivityLog = require("../models/ActivityLog");
    const limit = Math.min(parseInt(req.query.limit || 30, 10), 100);
    const since = req.query.since ? new Date(req.query.since) : null;
    const q = { tenant: req.user.TenantID };
    if (since) q.createdAt = { $gte: since };
    const logs = await ActivityLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok:true, logs: logs.map(l => ({ id:l._id, action:l.action, createdAt:l.createdAt, actor:{ id:l.actor, name:l.actorName, email:l.actorEmail }, target:l.target, meta:l.meta }))});
  } catch (e) { console.error('GET /logs error:', e); res.status(500).json({ ok:false, message:'שגיאה בטעינת הלוגים' }); }
});

router.put('/admin/tenants/:id/features', requireTeamAccess, async (req, res) => {
  const { id } = req.params;
  const { key, value, ...bulk } = req.body || {};
  const tenant = await Tenant.findById(id);
  if (!tenant) return res.status(404).json({ ok:false, message:"עסק לא נמצא" });
  if (!tenant.features) tenant.features = new Map();
  if (!(tenant.features instanceof Map) && typeof tenant.features === 'object') {
    tenant.features = new Map(Object.entries(tenant.features));
  }
  let changed = false;
  if (typeof key === "string") { tenant.features.set(key, !!value); changed = true; }
  else { for (const [k, v] of Object.entries(bulk)) { tenant.features.set(k, !!v); changed = true; } }
  if (changed) tenant.markModified('features');
  await tenant.save();
  res.json({ ok:true, features: featuresToPlain(tenant.features) });
});

// הוסף נקודת קצה חדשה לקבלת כל המשתמשים של העסק
router.get('/team/members', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    
    // Get all users that belong to this tenant through memberships
    const activeUsers = await User.find({
      'memberships.tenant': tenantId
    }).lean();

    // Get all pending invites for this tenant
    const pendingInvites = await Invite.find({
      tenant: tenantId,
      expiresAt: { $gt: new Date() }
    }).lean();

    // Combine and format the data
    const combinedTeam = [
      // Format active users
      ...activeUsers.map(user => {
        const membership = user.memberships.find(m => 
          String(m.tenant) === String(tenantId)
        );
        return {
          id: user._id,
          name: user.name || '',
          email: user.email,
          role: membership?.role || 'employee',
          status: 'active',
          type: 'member'
        };
      }),
      // Format pending invites
      ...pendingInvites.map(invite => ({
        id: invite._id,
        email: invite.email,
        name: invite.email.split('@')[0],
        role: invite.role || 'employee',
        status: 'pending',
        type: 'invite'
      }))
    ];

    return res.json({ 
      ok: true, 
      team: combinedTeam 
    });

  } catch (error) {
    console.error('Error in /team/members:', error);
    res.status(500).json({ 
      ok: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;
