// server.js (auth-only)
require("dotenv").config();

const express       = require("express");
const path          = require("path");
const cookieParser  = require("cookie-parser");
const bodyParser    = require("body-parser");
const helmet        = require("helmet");
const rateLimit     = require("express-rate-limit");
const hpp           = require("hpp");
const cors          = require("cors");
const csrf          = require("csurf");
const jwt           = require("jsonwebtoken");
const ActivityLog = require('./models/ActivityLog.js');
const { log } = require('./utils/logger');
const { connectMongoose } = require("./db"); // מחבר ל-MongoDB (מומלץ שמחזיר חיבור יחיד)
const User = require("./models/user");       // מודל משתמש קיים אצלך

// ===== App & Config =====
const app   = express();
const PORT  = process.env.PORT || 8080;
const SECRET = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === "production";

// ===== Middlewares (base) =====
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// סטטי (ל־CSS/JS/תמונות)
app.use(express.static("public", {
  maxAge: 0,
  etag: false,
  lastModified: false
}));
// קטלוג פיצ'רים – מקור האמת לשמות/אייקונים/ברירת מחדל
const FEATURE_CATALOG = {
  invoices:  { label: "חשבוניות",  icon: "fa-file-invoice", default: false },
  customers: { label: "לקוחות",    icon: "fa-users",         default: false },
  suppliers: { label: "ספקים",     icon: "fa-building",      default: false },
  orders:    { label: "הזמנות",    icon: "fa-box",           default: false },
  reports:   { label: "דוחות",     icon: "fa-chart-line",    default: false }
};

// אבטחה
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",     // הורד בפרודקשן אם אפשר
        "'unsafe-eval'",       // הורד בפרודקשן אם אפשר
        "https://www.gstatic.com",
        "https://www.googleapis.com",
        "https://www.google.com",
        "https://apis.google.com",
        "https://www.recaptcha.net",
        "https://cdn.jsdelivr.net",
        "https://vercel.live", "https://*.vercel.live",
      ],
      connectSrc: [
        "'self'",
        "https://www.gstatic.com",
        "https://www.googleapis.com",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://www.recaptcha.net",
        "https://cdn.jsdelivr.net",
        "https://vercel.live", "https://*.vercel.live",
        "wss://vercel.live",   "wss://*.vercel.live",
      ],
      frameSrc: [
        "'self'",
        "https://www.google.com",
        "https://www.gstatic.com",
        "https://www.recaptcha.net",
        "https://vercel.live", "https://*.vercel.live",
      ],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:  ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    }
  }
}));

app.use(cors({
  origin: ["http://localhost:3000","https://closemanages.vercel.app"],
  credentials: true
}));

app.use(hpp());

// אין קאשינג לקבצי HTML/CSS/JS (לנוחות פיתוח)
app.use((req, res, next) => {
    const tag = `${req.method} ${req.url}`;
  console.time(tag);
  res.on('finish', () => console.timeEnd(tag));
  if (/\.(html|css|js)$/.test(req.url)) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// ===== Mongo Connect (חד-פעמי) =====
(async () => {
  try {
    await connectMongoose();
    
    console.log("✅ Mongo connected");
  } catch (e) {
    console.error("❌ Mongo connect failed:", e);
  }
})();

// ===== Utils =====
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(["/login","/register","/auth/request-email-code","/auth/verify-email-code"], authLimiter);

const nodemailer = require("nodemailer");
const emailOtpStore = Object.create(null);

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: { rejectUnauthorized: false },
  debug: true,
  logger: true
});

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function isEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || "").toLowerCase());
}

// ===== CSRF =====
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd
  }
});
app.use(csrfProtection);
app.get("/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.redirect('/login.html');
    }

    const decoded = jwt.verify(token, SECRET);
    const user = await User.findById(decoded.id)
      .populate('TenantID')  // טוען את פרטי הטנאנט
      .lean();
    
    if (!user) {
      return res.redirect('/login.html');
    }

    req.user = user;  // שומרים את המשתמש ב-request
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.redirect('/login.html');
  }
};
function requireTeamManager(req, res, next) {
  const tenantId = req.user.TenantID;
  const myRole = (req.user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;

  if (!myRole || !['owner'].includes(myRole)) {
    return res.status(403).json({ ok:false, message:'אין לך הרשאה לניהול צוות' });
  }
  next();
}
function requireAuthPage(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.redirect("/login");
    jwt.verify(token, SECRET);  // אם לא תקין → נקפוץ ל-catch
    return next();
  } catch {
    return res.redirect("/login");
  }
}


// authz.js
function isPlatformAdmin(user) {
  const list = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const byEnv = list.includes(String(user.email || "").toLowerCase());
  const byDb  = user.platformRole === "admin";
  return byEnv || byDb;
}

// תומך גם ב-CSV וגם ב-JSON array, מסיר רווחים וממיר ל-lowercase
function parseAdminList(val) {
  if (!val) return [];
  try {
    const arr = JSON.parse(val);
    if (Array.isArray(arr)) {
      return arr.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    }
  } catch {}
  return String(val)
    .split(/[,;|\s]+/)
    .map(s => s.replace(/^[\[\]'"\s]+|[\[\]'"\s]+$/g, '').trim().toLowerCase())
    .filter(Boolean);
}

// נשתמש בשם שהגדרת + שם גיבוי אם השתמשת בו קודם
const PLATFORM_ADMINS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function requirePlatformAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ ok:false, message:"Unauthorized" });
  const email = (req.user.email || "").toLowerCase();
  const isAdmin = req.user.platformRole === "admin" || PLATFORM_ADMINS.includes(email);
  if (!isAdmin) return res.status(403).json({ ok:false, message:"Forbidden" });
  next();
}

// ===== Views (Auth pages only) =====
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.get('/admin', authenticateUser, requirePlatformAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

app.get("/", requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});
const Tenant = require('./models/Tenant');
app.get('/api/admin/features-catalog',   authenticateUser, requirePlatformAdmin, (req, res) => {
  res.json({ ok: true, features: FEATURE_CATALOG });
});

app.get("/api/admin/tenants",
  authenticateUser,
  requirePlatformAdmin,
  async (req, res) => {
    const tenants = await Tenant.find({})
      .select("name createdAt owner settings features")
      .populate({ path: "owner", select: "name email" })
      .lean();

    res.json({
      ok: true,
      tenants: tenants.map(t => ({
        id: String(t._id),
        name: t.name,
        createdAt: t.createdAt,
        owner: t.owner ? { name: t.owner.name, email: t.owner.email } : null,
        settings: t.settings || {},
        features: t.features || {}
      }))
    });
  }
);

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Invoice = require('./models/Invoice'); // 👈 הוסף
const Counter = require('./models/Counter');

async function nextInvoiceNumber(tenantId) {
  const id = String(tenantId);
  // מעלה מונה בצורה אטומית; אם לא קיים – ייווצר עם seq=0 ואז יחזור 1
  let doc = await Counter.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // אם זה הרצה ראשונה ויש כבר חשבוניות עם מספרים, ניישר למקסימום הקיים
  if (doc.seq === 1) {
    const last = await Invoice.findOne({ tenant: tenantId, number: { $type: 'number' } })
      .sort({ number: -1 })
      .select('number')
      .lean();
    if (typeof last?.number === 'number' && last.number >= 1) {
      doc = await Counter.findOneAndUpdate(
        { _id: id },
        { $set: { seq: last.number + 1 } },
        { new: true }
      );
    }
  }
  return doc.seq;
}
// Multer (זיכרון) להעלאה ל-Cloudinary
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }});


// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'invoices';

function getRoleForTenant(user, tenantId) {
  return user.memberships?.find(m => String(m.tenant) === String(tenantId))?.role || null;
}


// server.js
// עדכון פיצ'רים ע"י אדמין פלטפורמה
app.put("/api/admin/tenants/:id/features",
  authenticateUser, requirePlatformAdmin, async (req, res) => {
    const { id } = req.params;
    const { key, value, ...bulk } = req.body || {};

    const tenant = await Tenant.findById(id);
    if (!tenant) return res.status(404).json({ ok:false, message:"עסק לא נמצא" });

    // ודא שיש features
    if (!tenant.features) {
      tenant.features = new Map();
    }

    // אם זה לא Map, המר ל-Map (תאימות לעבר)
    if (!(tenant.features instanceof Map) && typeof tenant.features === 'object') {
      tenant.features = new Map(Object.entries(tenant.features));
    }

    let changed = false;

    if (typeof key === "string") {
      tenant.features.set(key, !!value);
      changed = true;
    } else {
      for (const [k, v] of Object.entries(bulk)) {
        tenant.features.set(k, !!v);
        changed = true;
      }
    }

    if (changed) tenant.markModified('features');

    await tenant.save();

    // החזר תמיד אובייקט פשוט לפרונט
    const plain = Object.fromEntries(tenant.features instanceof Map
      ? tenant.features
      : Object.entries(tenant.features || {}));

    res.json({ ok:true, features: plain });
  }
);
const bcrypt = require("bcrypt");


app.post('/api/team/members', authenticateUser,requireTeamManager, async (req, res) => {
  try {
    let { name, email, password, role = 'employee', sendInvite = true } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ ok:false, message:'Missing name or email' });
    }

    // ניקוי
    email = String(email).trim().toLowerCase();
    role = String(role || 'employee').toLowerCase();

    // ולידציה מול התפקידים החדשים
    if (!['manager','shift_manager','employee'].includes(role)) {
      role = 'employee';
    }

    // אימייל תקין?
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ ok:false, message:'Invalid email' });
    }

    // מזהי הטננט מהמשתמש המחובר (המנהל)
    const tenantId   = req.user.TenantID;      
    const tenantName = req.user.TenantName || 'העסק שלך';
    const baseUrl    = process.env.BASE_URL || 'https://your-app-url';

    if (!tenantId) {
      return res.status(400).json({ ok:false, message:'Missing tenantId on the authenticated user' });
    }

    // חיפוש משתמש ע"י אימייל (שדה ייחודי גלובלי)
    let user = await User.findOne({ email });

    // --- מקרה 1: המשתמש כבר קיים במערכת (עם אותו אימייל) ---
    if (user) {
      const alreadyMember = user.memberships?.some(m => String(m.tenant) === String(tenantId));
      if (alreadyMember) {
        return res.status(409).json({ ok:false, message:'User already belongs to this tenant' });
      }

      // מוסיפים חברות ל-tenant הזה
      user.memberships = Array.isArray(user.memberships) ? user.memberships : [];
      user.memberships.push({ tenant: tenantId, role });

      user.TenantID = tenantId;
      user.TenantName = tenantName;

      await user.save();

      if (sendInvite) {
        const subject = `קיבלת גישה ל-${tenantName} במערכת New Deli`;
        const loginUrl = `${baseUrl}/login`;
        const text = `שלום ${name},

הוענקה לך גישה ל-${tenantName} במערכת New Deli תחת המשתמש הקיים שלך (${email}).
לכניסה: ${loginUrl}

אם שכחת סיסמה, ניתן לבצע איפוס במסך ההתחברות.`;
        const html = `
          <div style="font-family:Heebo,Arial,sans-serif;line-height:1.6;color:#222">
            <h2 style="margin:0 0 12px">עודכנה לך גישה ל-New Deli</h2>
            <p>הוענקה לך גישה לעסק: <b>${tenantName}</b> תחת המשתמש הקיים שלך.</p>
            <p><a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">כניסה למערכת</a></p>
            <p style="color:#555;font-size:14px">אם שכחת סיסמה, אפשר לאפס במסך ההתחברות.</p>
          </div>
        `;
        try {
          await mailer.sendMail({ from: `"New Deli" <${process.env.SMTP_USER}>`, to: email, subject, text, html });
        } catch (e) {
          console.error('invite email (existing user) failed:', e.message);
        }
      }

      return res.json({
        ok: true,
        member: { id: user.id, name: user.name, email: user.email, memberships: user.memberships },
        createdNewUser: false,
        addedMembership: true
      });
    }

    // --- מקרה 2: אין משתמש קיים — יוצרים משתמש חדש + חברות ל-tenant ---
    if (!password || String(password).length < 8) {
      return res.status(400).json({ ok:false, message:'Password too short (min 8)' });
    }

    const hash = await bcrypt.hash(password, 12);
const autoUsername = (name && name.trim())
  ? name.trim().toLowerCase().replace(/\s+/g, "_")
  : (email && email.includes("@"))
    ? email.split("@")[0]
    : "user" + Date.now();

user = await User.create({
  username: autoUsername,
  name: name || "No Name",
  email,
  passwordHash: hash,
  memberships: [{ tenant: tenantId, role }],
  TenantName: tenantName,
  TenantID: tenantId,
  isPlatformAdmin: false
});

await log(req, 'member:create', {
  kind: 'User',
  id:   String(user._id),
  label:user.name,
  email:user.email
}, { role });
    if (sendInvite) {
      const subject = `קבלת גישה ל-${tenantName} במערכת New Deli`;
      const loginUrl = `${baseUrl}/login`;
      const text = `שלום ${name},

נוצר עבורך משתמש במערכת New Deli עבור העסק: ${tenantName}.

אימייל: ${email}
סיסמה: ${password}

כניסה: ${loginUrl}

מומלץ לשנות סיסמה לאחר ההתחברות הראשונה.`;
      const html = `
        <div style="font-family:Heebo,Arial,sans-serif;line-height:1.6;color:#222">
          <h2 style="margin:0 0 12px">ברוך הבא ל-New Deli</h2>
          <p>נוצר עבורך משתמש עבור העסק: <b>${tenantName}</b>.</p>
          <div style="background:#f6f7f9;border:1px solid #e3e6ea;border-radius:10px;padding:12px 14px;margin:12px 0">
            <div><b>אימייל:</b> <span dir="ltr">${email}</span></div>
            <div><b>סיסמה:</b> <span dir="ltr">${password}</span></div>
          </div>
          <p><a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">התחברות למערכת</a></p>
          <p style="color:#555;font-size:14px">מומלץ לשנות סיסמה לאחר ההתחברות הראשונה.</p>
        </div>
      `;
      try {
        await mailer.sendMail({ from: `"New Deli" <${process.env.SMTP_USER}>`, to: email, subject, text, html });
      } catch (e) {
        console.error('invite email (new user) failed:', e.message);
      }
    }

    return res.json({
      ok: true,
      member: { id: user.id, name: user.name, email: user.email, memberships: user.memberships },
      createdNewUser: true,
      addedMembership: true
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});


// ===== Team Members Update/Delete =====
const mongoose = require("mongoose");

function getRoleForTenant(userDoc, tenantId) {
  try {
    const m = (userDoc?.memberships || []).find(mm => String(mm.tenant) === String(tenantId));
    return m?.role || null;
  } catch { return null; }
}

function isOwner(userDoc, tenantId) {
  return getRoleForTenant(userDoc, tenantId) === 'owner';
}
function isManager(userDoc, tenantId) {
  return getRoleForTenant(userDoc, tenantId) === 'manager';
}
function featureOn(features, key) {
  if (!features) return false;
  if (typeof features.get === 'function') return !!features.get(key); // Map/Mongoose Map
  return !!features[key]; // Object רגיל
}

function featuresToPlain(features) {
  if (!features) return {};
  if (typeof features.get === 'function') return Object.fromEntries(features); // Map -> Object
  return { ...features }; // כבר אובייקט
}
// עדכון עובד קיים
app.put('/api/team/members/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const editorRole = getRoleForTenant(req.user, tenantId);
    if (!editorRole || !['owner','manager'].includes(editorRole)) {
      return res.status(403).json({ ok:false, message:'אין לך הרשאה לערוך עובדים' });
    }

    const { id } = req.params;
    const { name, role, status } = req.body || {};

    // מוצאים את העובד היעד
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ ok:false, message:'משתמש לא נמצא' });

    // חובה שהעובד שייך לאותו tenant
    const memIdx = (target.memberships || []).findIndex(m => String(m.tenant) === String(tenantId));
    if (memIdx === -1) {
      return res.status(404).json({ ok:false, message:'המשתמש אינו שייך לעסק זה' });
    }

    const targetRole = target.memberships[memIdx].role;

    // 🔒 אסור לגעת בבעלים
    if (targetRole === 'owner') {
      return res.status(403).json({ ok:false, message:'אסור לערוך/להחליף תפקיד לבעלים של העסק' });
    }

    // חוקים למנהל (owner יכול הכל על לא-בעלים)
    if (editorRole === 'manager') {
      // מנהל לא יכול לערוך מנהל אחר או להפוך מישהו ל-owner/manager
      if (targetRole === 'manager') {
        return res.status(403).json({ ok:false, message:'מנהל לא יכול לערוך מנהל אחר' });
      }
      if (role && ['owner','manager'].includes(String(role).toLowerCase())) {
        return res.status(403).json({ ok:false, message:'מנהל לא יכול להעלות תפקיד ל-owner/manager' });
      }
    }

    // --- נעקוב אחרי ערכים קודמים ל-log
    const beforeName = target.name;
    const beforeRole = target.memberships[memIdx].role;

    // עדכון שם (לא חובה)
    if (typeof name === 'string' && name.trim()) {
      target.name = name.trim();
    }

    // עדכון תפקיד (לא חובה)
    if (typeof role === 'string' && role.trim()) {
      const clean = role.trim().toLowerCase();
      const ALLOWED = ['owner','shift_manager','employee']; // התפקידים שהגדרת
      if (!ALLOWED.includes(clean)) {
        return res.status(400).json({ ok:false, message:'תפקיד לא תקין' });
      }
      target.memberships[memIdx].role = clean;
    }

    // עדכון סטטוס (אם קיים בסכמה שלך)
    if (typeof status === 'string' && status.trim()) {
      const cleanStatus = status.trim().toLowerCase();
      // target.memberships[memIdx].status = cleanStatus; // אם קיימת עמודה כזו
    }

    await target.save();

    // --- LOG: נרשום רק אם משהו באמת השתנה
    const afterName = target.name;
    const afterRole = target.memberships[memIdx].role;

    if (beforeName !== afterName || beforeRole !== afterRole) {
      await log(
        req,
        'member:update',
        {
          kind:  'User',
          id:    String(target._id),
          label: target.name,
          email: target.email
        },
        {
          tenant:    String(tenantId),
          nameFrom:  String(beforeName || ''),
          nameTo:    String(afterName  || ''),
          roleFrom:  String(beforeRole || ''),
          roleTo:    String(afterRole  || '')
          // אם תוסיף סטטוס: statusFrom: beforeStatus, statusTo: afterStatus
        }
      );
    }

    return res.json({
      ok: true,
      member: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.memberships[memIdx].role
        // status: target.memberships[memIdx].status ?? 'active'
      }
    });
  } catch (e) {
    console.error('PUT /api/team/members/:id', e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});


// מחיקת עובד
app.delete('/api/users/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const editorRole = getRoleForTenant(req.user, tenantId);
    if (!editorRole || !['owner','manager'].includes(editorRole)) {
      return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק עובדים' });
    }

    const { id } = req.params;
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ ok:false, message:'משתמש לא נמצא' });

    const memIdx = (target.memberships || []).findIndex(m => String(m.tenant) === String(tenantId));
    if (memIdx === -1) {
      return res.status(404).json({ ok:false, message:'המשתמש אינו שייך לעסק זה' });
    }

    const targetRole = target.memberships[memIdx].role;

    // 🔒 אי אפשר למחוק בעלים
    if (targetRole === 'owner') {
      return res.status(403).json({ ok:false, message:'אסור למחוק את בעל העסק' });
    }

    // מנהל לא יכול למחוק מנהל
    if (editorRole === 'manager' && targetRole === 'manager') {
      return res.status(403).json({ ok:false, message:'מנהל לא יכול למחוק מנהל' });
    }

    // אם יש למשתמש יותר מטננט אחד – נסיר רק את החברות לטננט הזה.
    target.memberships.splice(memIdx, 1);

    // תאימות: אם אתה משתמש בשדות "שטוחים" TenantID/TenantName לתצוגה, ננקה אותם
    // רק אם אחרי ההסרה אין לו יותר חברות (או תעדכן לטננט אחר אם יש).
    if (!target.memberships.length) {
      target.TenantID = undefined;
      target.TenantName = undefined;
    }

    await target.save();
    return res.json({ ok:true });
  } catch (e) {
    console.error('DELETE /api/users/:id', e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});





// 🔹 שליחת קוד למייל - מעדכנים לשמור את tenantName
app.post("/auth/request-email-code", async (req, res) => {
  try {
    const { name, email, tenantName, tenantPhone } = req.body || {};  // 🆕 קוראים tenantName
const cleanName        = String(name || "").trim();
const cleanEmail       = String(email || "").trim().toLowerCase();
const cleanTenantName  = String(tenantName || "").trim();
const cleanTenantPhone = String(tenantPhone || "").trim();

    // ✅ בדיקת תקינות
if (!cleanName || !isEmail(cleanEmail) || !cleanTenantName || !cleanTenantPhone) {
  return res.status(400).json({
    ok: false,
    message: "יש למלא שם, אימייל, שם עסק ומספר טלפון"
  });
}

    const code = genCode();
    
    // 🆕 שומרים גם את tenantName ב-store הזמני
emailOtpStore[cleanEmail] = {
  code,
  name: cleanName,
  tenantPhone: cleanTenantPhone,
  tenantName: cleanTenantName,
  expires: Date.now() + 5 * 60 * 1000
};

    await mailer.sendMail({
      from: `"New Deli" <${process.env.SMTP_USER}>`,
      to: cleanEmail,
      subject: "קוד התחברות",
      text: `שלום ${cleanName}, הקוד שלך הוא: ${code} (תקף ל-5 דקות).`
    });

    res.json({ ok: true, message: "נשלח קוד לאימייל" });
  } catch (err) {
    console.error("request-email-code error:", err);
    res.status(500).json({ ok: false, message: "שגיאה בשליחת הקוד" });
  }
});
const requireTenantFeature = (feature) => async (req, res, next) => {
  try {
    const t = await Tenant.findById(req.user.TenantID).select('features');
    const on = featureOn(t?.features, feature);
    if (!on) {
      return res.status(403).json({ ok:false, message:'הפיצ׳ר לא פעיל לעסק זה' });
    }
    next();
  } catch (e) {
    console.error('requireTenantFeature error:', e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
};
// לקרוא לוגים של הטננט הנוכחי
app.get('/api/logs', authenticateUser, async (req, res) => {
  try {
    const myRole = req.user.memberships?.find(m => String(m.tenant) === String(req.user.TenantID))?.role || 'employee';
    // מי יכול לראות לוגים?
    if (!['owner','manager','shift_manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה לצפייה ביומן' });
    }

    const limit = Math.min(parseInt(req.query.limit || 30, 10), 100);
    const since = req.query.since ? new Date(req.query.since) : null;

    const q = { tenant: req.user.TenantID };
    if (since) q.createdAt = { $gte: since };

    const logs = await ActivityLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();

    res.json({
      ok: true,
      logs: logs.map(l => ({
        id: l._id,
        action: l.action,
        createdAt: l.createdAt,
        actor: { id: l.actor, name: l.actorName, email: l.actorEmail },
        target: l.target,
        meta: l.meta
      }))
    });
  } catch (e) {
    console.error('GET /api/logs error:', e);
    res.status(500).json({ ok:false, message:'שגיאה בטעינת הלוגים' });
  }
});

const slugify = require('slugify');


// 🔹 אימות קוד - יצירת משתמש עם Tenant
app.post("/auth/verify-email-code", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const rec = emailOtpStore[cleanEmail];

    if (!isEmail(cleanEmail)) 
      return res.status(400).json({ ok: false, message: "אימייל לא תקין" });
    
    if (!rec) 
      return res.status(400).json({ ok: false, message: "לא נשלח קוד" });
    
    if (rec.expires < Date.now()) {
      delete emailOtpStore[cleanEmail];
      return res.status(400).json({ ok: false, message: "קוד פג תוקף" });
    }
    
    if (rec.code !== String(code)) 
      return res.status(400).json({ ok: false, message: "קוד שגוי" });

    // ✅ בודקים אם המשתמש קיים
    let user = await User.findOne({ email: cleanEmail });
    
    if (!user) {
      // 🔹 שלב 1: יוצרים User תחילה (ללא Tenant)
      user = await User.create({
        username: rec.name,
        email: cleanEmail,
        name: rec.name,
        role: "user",
        TenantName: rec.tenantName,
        memberships: []  // ריק בינתיים
      });
const slug = slugify(rec.tenantName, { lower: true, strict: true });
      // 🔹 שלב 2: יוצרים Tenant עם ה-owner שיצרנו
const newTenant = await Tenant.create({
  name: rec.tenantName,
  slug,                   // 👈 חובה למלא
  owner: user._id
});

      // 🔹 שלב 3: מעדכנים את ה-User עם ה-Tenant
      user.TenantID = newTenant._id;
      user.memberships = [{
        tenant: newTenant._id,
        role: 'owner'
      }];
      await user.save();
    }

    // ✅ יוצרים JWT token
    const payload = { id: user._id.toString() };
    const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
    
    res.cookie("token", token, {
      sameSite: "lax",
      secure: isProd,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    });

    delete emailOtpStore[cleanEmail];

res.json({
  ok: true,
  message: "מחובר!",
  redirect: "/",  // 🆕 הוספה
  user: {
    id: user._id,
    username: user.username || rec.name || cleanEmail.split("@")[0],
    email: user.email,
    role: user.role,
    tenantName: user.TenantName,
    tenantId: user.TenantID
  }
});
  } catch (err) {
    console.error("verify-email-code error:", err);
    res.status(500).json({ ok: false, message: "שגיאה באימות" });
  }
});
// העלאת חשבונית
app.post('/api/invoices/upload',
  authenticateUser,
  requireTenantFeature('invoices'),
  upload.single('file'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      if (!tenantId) return res.status(400).json({ ok:false, message:'חסרה זיקה לעסק' });
      if (!req.file) return res.status(400).json({ ok:false, message:'לא נבחר קובץ' });

      const description = String(req.body?.description || '').trim();
      if (!description) return res.status(400).json({ ok:false, message:'יש להזין תיאור' });

      // העלאה ל-Cloudinary
      const streamUpload = (buffer) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: CLOUD_FOLDER, resource_type: 'auto' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(buffer);
      });
      const up = await streamUpload(req.file.buffer);

      // מספר חשבונית רץ לטננט
      const number = await nextInvoiceNumber(tenantId);

      // שמירה ל-DB
      const inv = await Invoice.create({
        tenant: tenantId,
        number,                     // ✅ חשוב!
        uploadedBy: req.user._id,
        description,
        uploadedByN: req.user.name,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        file: {
          public_id: up.public_id,
          url: up.secure_url || up.url,
          format: up.format,
          resource_type: up.resource_type,
          bytes: up.bytes, width: up.width, height: up.height,
          original_filename: up.original_filename
        }
      });

      await log(req, 'העלאת חשבונית',
        { kind: 'Invoice', id: String(inv._id), label: inv.description },
        { description }
      );

      res.json({ ok:true,
        id: inv._id, url: inv.file?.url, originalname: inv.originalname,
        username: inv.uploadedByN,
        mimetype: inv.mimetype, size: inv.size, description: inv.description,
        uploadedAt: inv.createdAt
      });
    } catch (e) {
      console.error('upload invoice error:', e);
      res.status(500).json({ ok:false, message: e.message || 'שגיאה בהעלאה' });
    }
  }
);
// מחיקת חשבונית
app.delete('/api/invoices/:id',
  authenticateUser,
  requireTenantFeature('invoices'),
  async (req, res) => {
    console.log('DELETE /api/invoices', req.params.id);
    try {
      const tenantId = req.user.TenantID;
      const { id }   = req.params;

      const inv = await Invoice.findById(id);
      if (!inv) return res.status(404).json({ ok:false, message:'חשבונית לא נמצאה' });
      if (String(inv.tenant) !== String(tenantId)) {
        return res.status(403).json({ ok:false, message:'אין לך גישה לחשבונית זו' });
      }

      // הרשאות מחיקה: בעלים/מנהל/אחמ״ש, או המעלה עצמו
      const myRole = getRoleForTenant(req.user, tenantId);
      const isUploader = String(inv.uploadedBy) === String(req.user._id);
      if (!['owner','manager','shift_manager'].includes(myRole) && !isUploader) {
        return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק חשבונית זו' });
      }

      // מחיקה מקלאודינרי (אם יש)
      try {
        if (inv.file?.public_id) {
          const rtype = inv.file?.resource_type || (String(inv.mimetype||'').includes('pdf') ? 'raw' : 'image');
          await cloudinary.uploader.destroy(inv.file.public_id, { resource_type: rtype });
        }
      } catch (e) {
        console.warn('cloudinary destroy failed:', e.message);
      }

      // לוג מחיקה
      await log(req, 'invoice:delete',
        { kind: 'Invoice', id: String(inv._id), label: inv.description || inv.originalname, url: inv.file?.url },
        { size: inv.size, mimetype: inv.mimetype }
      );

      await Invoice.deleteOne({ _id: inv._id });

      res.json({ ok:true });
    } catch (e) {
      console.error('delete invoice error:', e);
      res.status(500).json({ ok:false, message:'שגיאה במחיקה' });
    }
  }
);

// חיפוש חשבוניות לפי תיאור
app.get('/api/invoices/search',
  authenticateUser,
  requireTenantFeature('invoices'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const q = String(req.query.q || '').trim();
      const cond = { tenant: tenantId };
      if (q) cond.description = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

      const items = await Invoice.find(cond)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      res.json({ ok: true, items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'שגיאה בחיפוש' });
    }
  }
);

// רשימת חשבוניות אחרונות
app.get('/api/invoices/list',
  authenticateUser,
  requireTenantFeature('invoices'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const items = await Invoice.find({ tenant: tenantId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      res.json({ ok: true, items });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, message: 'שגיאה בטעינה' });
    }
  }
);

// הרשמה ידנית (ללא סיסמה)
app.post("/register", async (req, res) => {
  try {
    const { username, email, name } = req.body || {};
    if (!username || !email || !name) {
      return res.status(400).json({ ok: false, message: "חסר נתונים" });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail    = email.trim().toLowerCase();

    const existing = await User.findOne({ $or: [{ username: cleanUsername }, { email: cleanEmail }] });
    if (existing) {
      return res.status(400).json({ ok: false, message: "שם משתמש או אימייל כבר בשימוש" });
    }

    const user = await User.create({
      username: cleanUsername,
      email: cleanEmail,
      name: name.trim(),
      role: "user"
    });

    res.json({ ok: true, message: "נרשמת בהצלחה", user: { id: user._id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ ok: false, message: "שגיאה ברישום" });
  }
});

// מי מחובר? (ע"פ cookie JWT)
app.get("/me", authenticateUser, (req,res) => {
  const user = req.user;
  res.json({
    ok: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole || "user"
    },
    isPlatformAdmin: isPlatformAdmin(user)
  });
});
console.log("[ADMIN EMAILS]", process.env.PLATFORM_ADMIN_EMAILS);
// תאימות לאחור אם יש קוד פרונט שמחפש cookie בשם "user"
app.get("/user", (req, res) => {
  if (req.cookies && req.cookies.user) {
    try {
      const user = JSON.parse(req.cookies.user);
      return res.json({ ok: true, user });
    } catch {
      return res.json({ ok: false });
    }
  }
  res.json({ ok: false });
});

// server.js (או קובץ הראוטים שלך)
app.put("/api/user/update", authenticateUser, async (req, res) => {
  try {
    const { name } = req.body || {};
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      return res.status(400).json({ ok: false, message: "יש להזין שם מלא" });
    }
    if (cleanName.length > 80) {
      return res.status(400).json({ ok: false, message: "שם ארוך מדי" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ ok: false, message: "משתמש לא נמצא" });
    }

    user.name = cleanName;
    await user.save();

    return res.json({
      ok: true,
      message: "הפרופיל עודכן בהצלחה",
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error("user/update error:", err);
    return res.status(500).json({ ok: false, message: "שגיאה בעדכון הפרופיל" });
  }
});

// Middleware לבדיקת authentication

function plainFeatures(f) {
  if (!f) return {};
  if (f instanceof Map) return Object.fromEntries(f);
  if (typeof f === 'object') return f;
  return {};
}


app.get("/api/tenant/info", authenticateUser, async (req, res) => {
  try {
    const user = req.user;

    // תומך גם ב-TenantID מאוכלס (populate) וגם ב-ObjectId רגיל
    const tenantId = user?.TenantID?._id || user?.TenantID;
    const tenant = await Tenant.findById(tenantId).lean();

    // ❗ חובה לבדוק לפני גישה לשדות
    if (!tenant) {
      return res.status(404).json({ ok: false, message: "עסק לא נמצא" });
    }

    // נירמול פיצ'רים לאובייקט פשוט
    const featuresObj = plainFeatures(tenant.features);

    // בניית featureState לפי הקטלוג
    // FEATURE_CATALOG יכול להיות אובייקט (מפתח→מידע) או מערך של מפתחות.
    const catalogKeys = Array.isArray(globalThis.FEATURE_CATALOG)
      ? globalThis.FEATURE_CATALOG
      : (globalThis.FEATURE_CATALOG && typeof globalThis.FEATURE_CATALOG === "object")
        ? Object.keys(globalThis.FEATURE_CATALOG)
        : Object.keys(featuresObj); // fallback סביר אם אין קטלוג

    const featureState = Object.fromEntries(
      catalogKeys.map(k => [k, !!featuresObj[k]])
    );

    // חברי צוות + בעלים
    const teamMembers = await User.find({ TenantID: tenant._id })
      .select("name email role memberships")
      .lean();

    const owner = teamMembers.find(m =>
      m.memberships?.some(mem =>
        String(mem?.tenant) === String(tenant._id) && mem.role === "owner"
      )
    );

    const currentRole =
      user.memberships?.find(mem => String(mem?.tenant) === String(tenant._id))
        ?.role || "staff";

    return res.json({
      ok: true,
      tenant: {
        id: tenant._id,
        name: tenant.name,
        createdAt: tenant.createdAt,
        settings: tenant.settings || {},
        features: featuresObj
      },
      featureState, // 👈 כאן זה מגיע ללקוח
      currentUser: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: currentRole
      },
      owner: owner ? { name: owner.name, email: owner.email } : null,
      teamMembers: teamMembers.map(m => ({
        id: m._id,
        name: m.name,
        email: m.email,
        role:
          m.memberships?.find(mem => String(mem?.tenant) === String(tenant._id))
            ?.role || "staff"
      }))
    });
  } catch (err) {
    console.error("tenant/info error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "שגיאה בטעינת נתוני העסק" });
  }
});

// Route לעדכון פרטי עסק (רק לבעלים/מנהלים)
app.put("/api/tenant/update", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const { name, settings } = req.body;

    // בדיקה שהמשתמש הוא owner או admin
    const membership = user.memberships?.find(m => 
      m.tenant.toString() === user.TenantID.toString()
    );

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ 
        ok: false, 
        message: "אין הרשאה לעדכן פרטי העסק" 
      });
    }

    const tenant = await Tenant.findById(user.TenantID);
    if (!tenant) {
      return res.status(404).json({ 
        ok: false, 
        message: "עסק לא נמצא" 
      });
    }

    // עדכון פרטים
    if (name) tenant.name = name.trim();
    if (settings) {
      tenant.settings = { ...tenant.settings, ...settings };
    }

    await tenant.save();

    res.json({ 
      ok: true, 
      message: "העסק עודכן בהצלחה",
      tenant: {
        id: tenant._id,
        name: tenant.name,
        settings: tenant.settings
      }
    });
  } catch (err) {
    console.error("tenant/update error:", err);
    res.status(500).json({ 
      ok: false, 
      message: "שגיאה בעדכון העסק" 
    });
  }
});


// Logout (מנקה קוקים)
app.post("/logout", (req, res) => {
  res.clearCookie("token", { sameSite: "lax", secure: isProd, httpOnly: true });
  res.clearCookie("user", { sameSite: "lax" });
  res.json({ ok: true, message: "התנתקת בהצלחה" });
});
app.get("/logout", (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  // חשוב: אותן אפשרויות כמו בזמן ה-set כדי שיימחק בטוח
  res.clearCookie("token", { sameSite: "lax", secure: isProd, httpOnly: true });
  res.clearCookie("user",  { sameSite: "lax" });
  return res.redirect("/login");
});
// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error("🔥 Express Error:", err);
  res.status(500).json({ ok: false, message: "Server error", error: err.message });
});

// ===== Start / Export (Vercel) =====
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => console.log(`🚀 Auth server listening on :${PORT}`));
}
