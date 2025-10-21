const express = require("express");
const bcrypt = require("bcrypt");
const { clean, cleanEmail, isEmail, genCode, uniqueTenantSlug } = require("../utils/helpers");
const { signAuthCookie, roleHomeFor } = require("../middlewares/auth");
const { mailer } = require("../config/mailer");
const Tenant = require("../models/Tenant");
const User = require("../models/user");
const Invite = require("../models/Invite");

const router = express.Router();

const emailOtpStore = Object.create(null);
const passwordResetStore = Object.create(null);

router.get("/invite/:token", async (req, res) => {
  try {
    const inv = await Invite.findOne({ token: req.params.token }).lean();
    if (!inv || inv.expiresAt < new Date()) return res.status(404).json({ ok:false, message:'הזמנה לא תקפה' });
    const tenant = await Tenant.findById(inv.tenant).select('name').lean();
    return res.json({ ok:true, email: inv.email, role: inv.role, tenant: { id: String(inv.tenant), name: tenant?.name || 'העסק' } });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message:'Server error' }); }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, name, password } = req.body || {};
    if (!token || !name || !password) return res.status(400).json({ ok:false, message:"נתונים חסרים" });
    const invite = await Invite.findOne({ token }).populate("tenant");
    if (!invite || invite.expiresAt < new Date()) return res.status(400).json({ ok:false, message:"ההזמנה לא תקפה או פגה תוקף" });

    let user = await User.findOne({ email: invite.email });
    const hash = await bcrypt.hash(password, 10);

    if (user) {
      if (!user.memberships.some(m => String(m.tenant) === String(invite.tenant._id))) {
        user.memberships.push({ tenant: invite.tenant._id, role: invite.role });
      }
      if (!user.passwordHash) user.passwordHash = hash;
      if (!user.name && name) user.name = name;
      await user.save();
    } else {
      user = await User.create({
        name, email: invite.email, passwordHash: hash,
        memberships: [{ tenant: invite.tenant._id, role: invite.role }],
      });
    }
    await invite.deleteOne();
    signAuthCookie(res, { userId: user._id });
    res.json({ ok:true, redirect:"/" });
  } catch (err) {
    console.error("accept invite error:", err);
    res.status(500).json({ ok:false, message:"שגיאה בשרת בעת קבלת ההזמנה" });
  }
});

router.post("/request-email-code", async (req, res) => {
  try {
    const { name, email, tenantName, tenantPhone } = req.body || {};
    const cleanName   = clean(name);
    const ce          = cleanEmail(email);
    const tName       = clean(tenantName);
    const tPhone      = clean(tenantPhone);

    if (!cleanName || !isEmail(ce) || !tName || !tPhone) {
      return res.status(400).json({ ok:false, message:"יש למלא שם, אימייל, שם עסק ומספר טלפון" });
    }
    const code = genCode();
    emailOtpStore[ce] = { code, name: cleanName, tenantPhone: tPhone, tenantName: tName, expires: Date.now() + 5*60*1000 };

    await mailer.sendMail({
      from: `"New Deli" <${process.env.SMTP_USER}>`,
      to: ce,
      subject: "קוד התחברות",
      text: `שלום ${cleanName}, הקוד שלך הוא: ${code} (תקף ל-5 דקות).`
    });

    res.json({ ok:true, message:"נשלח קוד לאימייל" });
  } catch (err) { console.error("request-email-code error:", err); res.status(500).json({ ok:false, message:"שגיאה בשליחת הקוד" }); }
});

router.post("/verify-email-code", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const ce  = cleanEmail(email);
    const rec = emailOtpStore[ce];

    if (!isEmail(ce))              return res.status(400).json({ ok:false, message:"אימייל לא תקין" });
    if (!rec)                      return res.status(400).json({ ok:false, message:"לא נשלח קוד" });
    if (rec.expires < Date.now()) { delete emailOtpStore[ce]; return res.status(400).json({ ok:false, message:"קוד פג תוקף" }); }
    if (rec.code !== String(code)) return res.status(400).json({ ok:false, message:"קוד שגוי" });

    if (rec.used) {
      const existingUser = await User.findOne({ email: ce });
      if (!existingUser || !existingUser.TenantID) {
        return res.status(409).json({ ok:false, message:"הקוד כבר נוצל. נסה לשלוח קוד חדש." });
      }
      signAuthCookie(res, { userId: existingUser._id, tenantId: existingUser.TenantID, role: "owner" });
      return res.json({ ok:true, redirect: "/" });
    }

    const baseName = (rec.name || ce.split("@")[0]).trim();
    const initUsername = `${baseName}-${Math.floor(Math.random()*10000)}`;
    let user = await User.findOneAndUpdate(
      { email: ce },
      { $setOnInsert: { username: initUsername, name: rec.name, role: "user", TenantName: rec.tenantName, memberships: [] } },
      { upsert: true, new: true }
    );

    const tenantName = rec.tenantName || `${rec.name || "עסק חדש"} ${Date.now()}`;
    let tenant = await Tenant.findOne({ owner: user._id, name: tenantName });
    if (!tenant) {
      const trySlug = await uniqueTenantSlug(tenantName);
      try {
        tenant = await Tenant.create({ name: tenantName, slug: trySlug, owner: user._id, settings: { phone: rec.tenantPhone || "" } });
      } catch (e) {
        if (e?.code === 11000) {
          tenant = await Tenant.create({ name: tenantName, slug: `${trySlug}-${Math.random().toString(36).slice(2,5)}`, owner: user._id, settings: { phone: rec.tenantPhone || "" } });
        } else throw e;
      }
    }

    const alreadyMember = (user.memberships || []).some(m => String(m.tenant) === String(tenant._id));
    if (!alreadyMember) {
      user.memberships = Array.isArray(user.memberships) ? user.memberships : [];
      user.memberships.push({ tenant: tenant._id, role: 'owner' });
    }
    user.TenantID = tenant._id;
    user.TenantName = tenant.name;
    await user.save();

    rec.used = true;
    delete emailOtpStore[ce];

    signAuthCookie(res, { userId: user._id, tenantId: tenant._id, role: "owner" });
    return res.json({ ok:true, message:"מחובר!", redirect: "/" });
  } catch (err) { console.error("verify-email-code error:", err); return res.status(500).json({ ok:false, message:"שגיאה באימות" }); }
});

// Unified login + legacy endpoint
const unifiedLoginHandler = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const ce = cleanEmail(email);
    if (!isEmail(ce) || !password || String(password).length < 6)
      return res.status(400).json({ ok:false, message:"אימייל/סיסמה לא תקינים" });

    const user = await User.findOne({ email: ce });
    if (!user || !user.passwordHash) return res.status(400).json({ ok:false, message:"משתמש לא נמצא או שאין סיסמה" });
    const ok = await require("bcrypt").compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok:false, message:"סיסמה שגויה" });

    let tenantId = user.TenantID;
    let role = null;

    if (tenantId) {
      const Tenant = require("../models/Tenant");
      const isOwnerOfActive = await Tenant.exists({ _id: tenantId, owner: user._id });
      const memRoleActive = (user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role || null;
      if (isOwnerOfActive) role = 'owner';
      else if (memRoleActive) role = memRoleActive;
      else tenantId = undefined;
    }
    if (!tenantId) {
      const owned = await require("../models/Tenant").findOne({ owner: user._id }).select("_id");
      if (owned) { tenantId = owned._id; role = 'owner'; }
    }
    if (!tenantId) {
      const m = (user.memberships || [])[0];
      if (m) { tenantId = m.tenant; role = m.role || 'employee'; }
    }
    if (!tenantId) {
      return res.status(200).json({ ok:false, code:"NO_TENANT", message:"לא משויך לעסק ולא בעל עסק" });
    }
    if (!role) {
      const memRole = (user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;
      role = memRole || (await require("../models/Tenant").exists({ _id: tenantId, owner: user._id }) ? 'owner' : 'employee');
    }
    if (!user.TenantID || String(user.TenantID) != String(tenantId)) {
      user.TenantID = tenantId;
      await user.save();
    }
    signAuthCookie(res, { userId: user._id, tenantId, role });
    return res.json({ ok:true, redirect:"/" });
  } catch (e) { console.error("unified login error:", e); res.status(500).json({ ok:false, message:"Server error" }); }
};
router.post("/login", unifiedLoginHandler);
router.post("/employee/login", unifiedLoginHandler);

router.post("/employee/reset", async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 6) return res.status(400).json({ ok:false, message:"טוקן/סיסמה לא תקינים" });
    const rec = passwordResetStore[token];
    if (!rec || rec.expires < Date.now()) { delete passwordResetStore[token]; return res.status(400).json({ ok:false, message:"טוקן לא תקף" }); }
    const user = await User.findOne({ email: rec.email });
    if (!user) { delete passwordResetStore[token]; return res.status(400).json({ ok:false, message:"משתמש לא קיים" }); }
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    delete passwordResetStore[token];
    res.json({ ok:true, message:"הסיסמה עודכנה. אפשר להתחבר." });
  } catch (e) { console.error("employee/reset error:", e); res.status(500).json({ ok:false, message:"Server error" }); }
});

router.post("/create", async (req, res) => {
  try {
    const { email } = req.body || {};
    const { cleanEmail, isEmail } = require("../utils/helpers");
    const ce = cleanEmail(email);
    const rec = emailOtpStore[ce];

    if (!isEmail(ce)) return res.status(400).json({ ok:false, message:"אימייל לא תקין" });
    if (!rec)        return res.status(400).json({ ok:false, message:"חסר מידע יצירה (שלח שוב טופס)" });

    const baseName = (rec.name || ce.split("@")[0]).trim();
    const initUsername = `${baseName}-${Math.floor(Math.random()*10000)}`;

    let ownerUser = await User.findOneAndUpdate(
      { email: ce },
      { $setOnInsert: { username: initUsername, name: rec.name, role: "user", TenantName: rec.tenantName, memberships: [] } },
      { upsert: true, new: true }
    );

    const tenantName = rec.tenantName || `${rec.name || "עסק חדש"} ${Date.now()}`;
    let tenant = await require("../models/Tenant").findOne({ owner: ownerUser._id, name: tenantName });
    if (!tenant) {
      const trySlug = await uniqueTenantSlug(tenantName);
      try {
        tenant = await require("../models/Tenant").create({ name: tenantName, slug: trySlug, owner: ownerUser._id, settings: { phone: rec.tenantPhone || "" } });
      } catch (e) {
        if (e?.code === 11000) {
          tenant = await require("../models/Tenant").create({ name: tenantName, slug: `${trySlug}-${Math.random().toString(36).slice(2,5)}`, owner: ownerUser._id, settings: { phone: rec.tenantPhone || "" } });
        } else throw e;
      }
    }

    const alreadyOwner = (ownerUser.memberships || []).some(m => String(m.tenant) === String(tenant._id));
    if (!alreadyOwner) {
      ownerUser.memberships = Array.isArray(ownerUser.memberships) ? ownerUser.memberships : [];
      ownerUser.memberships.push({ tenant: tenant._id, role: 'owner' });
    }
    await ownerUser.save();

    const token = require('crypto').randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000);
    await Invite.create({ tenant: tenant._id, email: ce, role: 'owner', token, expiresAt, createdBy: (req.user?._id || null) });

    const baseUrl = process.env.BASE_URL || 'https://your-app-url';
    const inviteUrl = `${baseUrl}/login?invite=${encodeURIComponent(token)}`;

    try {
      await mailer.sendMail({ from: `"New Deli" <${process.env.SMTP_USER}>`, to: ce, subject: `הוזמנת כבעל העסק ל-${tenant.name}`, text: `שלום ${rec.name || ''},\n\nנוצר עבורך עסק חדש: ${tenant.name}.\nלהשלמת יצירה/הגדרת סיסמה והתחברות:\n${inviteUrl}\n\nהלינק תקף ל-7 ימים.` });
    } catch (e) { console.error('owner invite mail failed:', e.message); }

    rec.used = true;
    delete emailOtpStore[ce];

    return res.json({ ok:true, message:"העסק נוצר. הזמנה נשלחה לבעל העסק במייל.", tenant:{ id:String(tenant._id), name:tenant.name }, owner:{ id:String(ownerUser._id), email: ownerUser.email } });
  } catch (err) { console.error("auth/create error:", err); return res.status(500).json({ ok:false, message:"שגיאה ביצירת העסק" }); }
});

module.exports = router;
