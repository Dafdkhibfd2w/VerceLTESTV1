// server.js (auth + app)
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
const mongoose      = require("mongoose");
const nodemailer    = require("nodemailer");
const bcrypt        = require("bcrypt");
const multer        = require("multer");
const cloudinary    = require("cloudinary").v2;
const slugify       = require("slugify");

// ===== Models & Utils =====
const { connectMongoose } = require("./db");
const ActivityLog = require("./models/ActivityLog");
const User        = require("./models/user");
const Tenant      = require("./models/Tenant");
const Invoice     = require("./models/Invoice");
const Counter     = require("./models/Counter");
const { log }     = require("./utils/logger");

// ===== App & Config =====
const app    = express();
const PORT   = process.env.PORT || 8080;
const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const isProd = process.env.NODE_ENV === "production";

// ===== Feature Catalog (platform toggles) =====
const FEATURE_CATALOG = {
  invoices:  { label: "חשבוניות",  icon: "fa-file-invoice", default: false },
  dispersions: { label: "פיזורים",    icon: "fa-taxi",         default: false },
  suppliers: { label: "ספקים",     icon: "fa-building",      default: false },
  orders:    { label: "הזמנות",    icon: "fa-box",           default: false },
  reports:   { label: "דוחות",     icon: "fa-chart-line",    default: false }
};

// ===== Base Middlewares =====
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(hpp());

// Static
app.use('/css',   express.static(path.join(__dirname, 'public/css')));
app.use('/js',    express.static(path.join(__dirname, 'public/js')));
app.use('/icons', express.static(path.join(__dirname, 'public/icons')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: false, lastModified: false }));

// No-cache for dev assets + basic request timer
app.use((req, res, next) => {
  const tag = `${req.method} ${req.url}`;
  console.time(tag);
  res.on('finish', () => console.timeEnd(tag));
  if (/\.(html|css|js)$/.test(req.url)) res.setHeader("Cache-Control", "no-store");
  next();
});
// 404 – אחרי כל הראוטים, לפני error handler



// Helmet (CSP tuned for your stack)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-site" },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'","'unsafe-inline'","'unsafe-eval'",
        "https://www.gstatic.com","https://www.googleapis.com","https://www.google.com",
        "https://apis.google.com","https://www.recaptcha.net","https://cdn.jsdelivr.net",
        "https://vercel.live","https://*.vercel.live"
      ],
      connectSrc: [
        "'self'","https://www.gstatic.com","https://www.googleapis.com",
        "https://identitytoolkit.googleapis.com","https://securetoken.googleapis.com",
        "https://www.recaptcha.net","https://cdn.jsdelivr.net",
        "https://vercel.live","https://*.vercel.live","wss://vercel.live","wss://*.vercel.live"
      ],
      frameSrc: [
        "'self'","https://www.google.com","https://www.gstatic.com",
        "https://www.recaptcha.net","https://vercel.live","https://*.vercel.live"
      ],
      imgSrc: ["'self'","data:","blob:","https:"],
      styleSrc: ["'self'","'unsafe-inline'","https://fonts.googleapis.com","https://cdnjs.cloudflare.com"],
      fontSrc:  ["'self'","data:","https://fonts.gstatic.com","https://cdnjs.cloudflare.com"]
    }
  }
}));

// CORS (update domains as needed)
app.use(cors({
  origin: [
    "https://verce-ltestv-1.vercel.app",
    "http://localhost:4000"
  ],
  credentials: true
}));

// ===== Mongo Connect (single) =====
mongoose.set('bufferCommands', false);
(async () => {
  try {
    await connectMongoose().then(()=> {
      




      
    });
    console.log("✅ Mongo connected");
  } catch (e) {
    console.error("❌ Mongo connect failed:", e);
  }
})();
// ensure connection for each request (fast no-op when already connected)
app.use(async (req, res, next) => {
  try { await connectMongoose(); next(); }
  catch (err) { console.error('DB connect failed:', err); res.status(503).json({ ok:false, message:'Database unavailable' }); }
});

// ===== Helpers =====
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use(["/login","/register","/auth/request-email-code","/auth/verify-email-code"], authLimiter);

const emailOtpStore      = Object.create(null); // { [email]: { code, name, tenantName, tenantPhone, expires } }
const passwordResetStore = Object.create(null); // { [token]: { email, expires } }

const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
  debug: true, logger: true
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,          // HTTPS on Vercel
  sameSite: "none",
  path: "/",
  maxAge: 1000*60*60*24*7
};

const genCode  = () => Math.floor(100000 + Math.random()*900000).toString();
const clean    = (s) => String(s||"").trim();
const cleanEmail = (s) => clean(s).toLowerCase();
const isEmail  = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(s));

function signAuthCookie(res, { userId, tenantId, role }) {
  const payload = { id: String(userId), TenantID: tenantId ? String(tenantId) : undefined, role };
  const token = jwt.sign(payload, SECRET, { expiresIn: "7d" });
  res.cookie("token", token, COOKIE_OPTIONS);
  return token;
}

// --- slug helpers (תומך בשמות בעברית/ריקים) ---
function makeSlugBase(name) {
  const raw = String(name || '').trim();
  // ניסיון ראשון: slugify (עלול להחזיר ריק עבור עברית)
  let s = slugify(raw, { lower: true, strict: true, locale: 'he' });

  // אם יצא ריק (עברית/סמלים) -> fallback בטוח
  if (!s) {
    // נסה להחליף רווחים במקף ולהסיר תווים בעייתיים; אם עדיין קצר/ריק, נייצר אוטומטי
    const ascii = raw
      .replace(/\s+/g, '-')              // רווחים -> מקפים
      .replace(/[^a-zA-Z0-9_-]/g, '')    // רק ASCII בסיסי
      .toLowerCase();

    s = ascii || `biz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  }
  // חתוך לאורך הגיוני (DB / SEO)
  return s.slice(0, 64);
}

async function uniqueTenantSlug(name) {
  const base = makeSlugBase(name);
  let slug = base;
  let i = 1;
  // דאג לייחודיות במסד (index unique על slug)
  while (await Tenant.exists({ slug })) {
    slug = `${base}-${i++}`;
  }
  return slug;
}



// ===== CSRF (optional) =====
const csrfProtection = csrf({
  cookie: { httpOnly: true, sameSite: "lax", secure: isProd }
});
app.use(csrfProtection);
app.get("/csrf-token", (req, res) => res.json({ csrfToken: req.csrfToken() }));

// ===== Auth Middlewares =====
async function loadUserFromToken(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  const dec = jwt.verify(token, SECRET);
  const user = await User.findById(dec.id).lean();
  if (!user) return null;
  return { decoded: dec, user };
}

// JSON auth for APIs
const authenticateUser = async (req, res, next) => {
  try {
    const pack = await loadUserFromToken(req);
    if (!pack) return res.redirect("/login");
    req.user = pack.user;
    req.auth = pack.decoded; // { id, TenantID, role }
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
function requireTeamManager(req, res, next) {
  const tenantId = req.user.TenantID;
  const myRole   = getRoleForTenant(req.user, tenantId);
  if (!myRole || !['owner'].includes(myRole)) {
    return res.status(403).json({ ok:false, message:'אין לך הרשאה לניהול צוות' });
  }
  next();
}

// Platform admins
const PLATFORM_ADMINS = (process.env.PLATFORM_ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function isPlatformAdmin(user) {
  const email = (user.email || "").toLowerCase();
  return user.platformRole === "admin" || PLATFORM_ADMINS.includes(email);
}

const ADMIN_SECRET = process.env.ADMIN_SECRET || "my-super-secret";

function requireTeamAccess(req, res, next) {
  const token = req.headers["x-team-token"] || req.query.token;
  if (token !== ADMIN_SECRET) {
    return res.status(403).json({ ok:false, message:"Access denied" });
  }
  next();
}
function requireRoles(roles = []) {
  return (req, res, next) => {
    const tenantId = req.user?.TenantID;
    if (!tenantId) return res.status(401).json({ ok:false, message: 'Unauthorized' });
    const role = getRoleForTenant(req.user, tenantId);
    if (!role || !roles.includes(role)) {
      // אם זה דף HTML – עדיף רידיירקט במקום JSON
      if (req.accepts('html')) return res.redirect('/worker');
      return res.status(403).json({ ok:false, message: 'Forbidden' });
    }
    next();
  };
}
function roleHomeFor(user) {
  const role = getRoleForTenant(user, user.TenantID);
  return ['owner','manager','shift_manager'].includes(role) ? '/manager' : '/worker';
}
// ===== Views =====
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html")); // הדף החדש עם הטאבים
});

app.get('/', authenticateUser, (req, res) => {
  const role = getRoleForTenant(req.user, req.user.TenantID);
  if (['owner','manager','shift_manager'].includes(role)) {
    return res.redirect('/manager');
  }
  return res.redirect('/worker');
});

app.get('/manager',
  authenticateUser,
  requireRoles(['owner','manager','shift_manager']),  // או רק ['owner','manager']
  (req, res) => res.sendFile(path.join(__dirname, 'views', 'manager.html'))
);

// אזור עובדים
app.get('/worker',
  authenticateUser,
  (req, res) => res.sendFile(path.join(__dirname, 'views', 'worker.html'))
);

app.get('/admin', requireTeamAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// ===== Admin – feature catalog =====
app.get('/api/admin/features-catalog', requireTeamAccess, (req, res) => {
  res.json({ ok:true, features: FEATURE_CATALOG });
});

// ===== Cloudinary & Multer (invoices) =====
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 }});
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const CLOUD_FOLDER = process.env.CLOUDINARY_FOLDER || 'invoices';

async function nextInvoiceNumber(tenantId) {
  const id = String(tenantId);
  let doc = await Counter.findOneAndUpdate(
    { _id: id }, { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (doc.seq === 1) {
    const last = await Invoice.findOne({ tenant: tenantId, number: { $type: 'number' } })
      .sort({ number: -1 }).select('number').lean();
    if (typeof last?.number === 'number' && last.number >= 1) {
      doc = await Counter.findOneAndUpdate(
        { _id: id }, { $set: { seq: last.number + 1 } }, { new: true }
      );
    }
  }
  return doc.seq;
}

// ===== Feature helpers =====
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

const Invite = require('./models/Invite');

// ===== AUTH: Owner/Manager via OTP =====

app.post('/api/team/invite', authenticateUser, async (req, res) => {
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

    // אם המשתמש כבר קיים ומשויך – סיים בנימוס
    const existing = await User.findOne({ email }).lean();
    if (existing?.memberships?.some(m => String(m.tenant) === String(tenantId))) {
      return res.status(409).json({ ok:false, message:'המשתמש כבר שייך לעסק' });
    }

    // צור טוקן הזמנה (תוקף 7 ימים)
    const token = require('crypto').randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000);

    await Invite.create({
      tenant: tenantId,
      email,
      role,
      token,
      expiresAt,
      createdBy: req.user._id
    });

    const baseUrl = process.env.BASE_URL || 'localhost:4000';
    const inviteUrl = `${baseUrl}/login?invite=${encodeURIComponent(token)}`;

    if (sendInvite) {
      const subject = `הוזמנת להצטרף ל-${tenant.name} במערכת New Deli`;
      const text = `שלום,\n\nהוזמנת להצטרף ל-${tenant.name} במערכת New Deli.\nלהשלמת יצירה/הצטרפות לחשבון והגדרת סיסמה:\n${inviteUrl}\n\nהלינק תקף ל-7 ימים.`;
const html = `
  <div style="font-family:Heebo,Arial,sans-serif;line-height:1.6;color:#222">
    <h2 style="margin:0 0 12px">הוזמנת ל-${tenant.name}</h2>
    <p>להשלמת ההרשמה והגדרת סיסמה:</p>

    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0">
      <tr>
        <td style="border-radius:8px; background:#2563eb;">
          <a href="${inviteUrl}"
             style="display:inline-block; padding:10px 16px; color:#ffffff; text-decoration:none; font-weight:600; border-radius:8px;"
             target="_blank" rel="noopener noreferrer">
            פתח הזמנה
          </a>
        </td>
      </tr>
    </table>

    <p style="color:#555;font-size:14px">הלינק תקף ל-7 ימים.</p>
    <p style="color:#777;font-size:12px">אם הכפתור לא עובד, אפשר להעתיק ולהדביק את הקישור ידנית:<br>
      <a href="${inviteUrl}" style="color:#2563eb;word-break:break-all">${inviteUrl}</a>
    </p>
  </div>
`;
      try {
        await mailer.sendMail({ from: `"New Deli" <${process.env.SMTP_USER}>`, to: email, subject, text, html });
      } catch (e) {
        console.error('invite mail failed:', e.message);
      }
    }

    return res.json({ ok:true, token }); // אם תרצה להציג QR/העתק קישור בממשק
  } catch (e) {
    console.error('POST /api/team/invite', e);
    return res.status(500).json({ ok:false, message:'Server error' });
  }
});
app.get('/auth/invite/:token', async (req, res) => {
  try {
    const inv = await Invite.findOne({ token: req.params.token }).lean();
    if (!inv || inv.expiresAt < new Date()) return res.status(404).json({ ok:false, message:'הזמנה לא תקפה' });

    const tenant = await Tenant.findById(inv.tenant).select('name').lean();
    return res.json({
      ok: true,
      email: inv.email,
      role: inv.role,
      tenant: { id: String(inv.tenant), name: tenant?.name || 'העסק' }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});
app.post("/auth/accept-invite", async (req, res) => {
  try {
    const { token, name, password } = req.body || {};
    if (!token || !name || !password) {
      return res.status(400).json({ ok: false, message: "נתונים חסרים" });
    }

    const invite = await Invite.findOne({ token }).populate("tenant");
    if (!invite || invite.expiresAt < new Date()) {
      return res.status(400).json({ ok: false, message: "ההזמנה לא תקפה או פגה תוקף" });
    }

    let user = await User.findOne({ email: invite.email });
    const hash = await bcrypt.hash(password, 10);

    if (user) {
      // משתמש קיים → רק עדכן פרטים והוסף את העסק אם לא קיים
      if (!user.memberships.some(m => String(m.tenant) === String(invite.tenant._id))) {
        user.memberships.push({ tenant: invite.tenant._id, role: invite.role });
      }
      if (!user.passwordHash) user.passwordHash = hash;
      if (!user.name && name) user.name = name;
      await user.save();
    } else {
      // משתמש חדש לגמרי
      user = await User.create({
        name,
        email: invite.email,
        passwordHash: hash,
        memberships: [{ tenant: invite.tenant._id, role: invite.role }],
      });
    }

    // מחיקת ההזמנה לאחר שימוש
    await invite.deleteOne();

    // כניסה אוטומטית אחרי קבלת הזמנה
    signAuthCookie(res, { userId: user._id });
    res.json({ ok: true, redirect: "/" });
  } catch (err) {
    console.error("accept invite error:", err);
    res.status(500).json({ ok: false, message: "שגיאה בשרת בעת קבלת ההזמנה" });
  }
});

app.get('/api/team/invites', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    // רק owner/manager רואים הזמנות
    const myRole = (req.user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;
    if (!['owner','manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה לצפות בהזמנות' });
    }

    const invites = await Invite.find({ tenant: tenantId, expiresAt: { $gte: new Date() } })
      .sort({ createdAt: -1 })
      .select('_id email role token createdAt expiresAt')
      .lean();

    return res.json({ ok:true, invites: invites.map(x => ({
      id: String(x._id),
      email: x.email,
      role: x.role,
      createdAt: x.createdAt,
      expiresAt: x.expiresAt
    }))});
  } catch (e) {
    console.error('GET /api/team/invites', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});
// DELETE /api/team/invites/:id  – ביטול הזמנה (owner/manager)
app.delete('/api/team/invites/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = (req.user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;
    if (!['owner','manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה לבטל הזמנה' });
    }

    const inv = await Invite.findById(req.params.id);
    if (!inv) return res.status(404).json({ ok:false, message:'הזמנה לא נמצאה' });
    if (String(inv.tenant) !== String(tenantId)) {
      return res.status(403).json({ ok:false, message:'אין גישה להזמנה זו' });
    }

    await Invite.deleteOne({ _id: inv._id });
    return res.json({ ok:true });
  } catch (e) {
    console.error('DELETE /api/team/invites/:id', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});
// POST /api/team/invites/:id/resend – שולח שוב מייל הזמנה
app.post('/api/team/invites/:id/resend', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const myRole = (req.user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;
    if (!['owner','manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה לשלוח מחדש' });
    }

    const inv = await Invite.findById(req.params.id).populate('tenant', 'name').lean();
    if (!inv) return res.status(404).json({ ok:false, message:'הזמנה לא נמצאה' });
    if (String(inv.tenant._id) !== String(tenantId)) {
      return res.status(403).json({ ok:false, message:'אין גישה להזמנה זו' });
    }
    if (inv.expiresAt < new Date()) {
      return res.status(400).json({ ok:false, message:'הזמנה פגה—צור חדשה' });
    }

    const baseUrl = process.env.BASE_URL || 'https://your-app-url';
    const inviteUrl = `${baseUrl}/register.html?invite=${encodeURIComponent(inv.token)}`;
    const subject = `תזכורת: הוזמנת להצטרף ל-${inv.tenant.name} במערכת New Deli`;
    const text = `שלום,\n\nתזכורת להזמנה להצטרף ל-${inv.tenant.name}.\nלהשלמת ההרשמה:\n${inviteUrl}\n\nהלינק תקף עד ${new Date(inv.expiresAt).toLocaleString('he-IL')}.`;
    const html = `
      <div style="font-family:Heebo,Arial,sans-serif;line-height:1.6;color:#222">
        <h2 style="margin:0 0 12px">תזכורת להצטרפות ל-${inv.tenant.name}</h2>
        <p>להשלמת ההרשמה:</p>
        <p><a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">פתח הזמנה</a></p>
        <p style="color:#555;font-size:14px">הזמנה תקפה עד ${new Date(inv.expiresAt).toLocaleString('he-IL')}.</p>
      </div>
    `;
    try {
      await mailer.sendMail({ from: `"New Deli" <${process.env.SMTP_USER}>`, to: inv.email, subject, text, html });
    } catch (e) {
      console.error('invite resend mail failed:', e.message);
    }

    return res.json({ ok:true });
  } catch (e) {
    console.error('POST /api/team/invites/:id/resend', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});
app.post("/auth/request-email-code", async (req, res) => {
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
  } catch (err) {
    console.error("request-email-code error:", err);
    res.status(500).json({ ok:false, message:"שגיאה בשליחת הקוד" });
  }
});
app.post("/auth/verify-email-code", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const ce  = cleanEmail(email);
    const rec = emailOtpStore[ce];

    if (!isEmail(ce))              return res.status(400).json({ ok:false, message:"אימייל לא תקין" });
    if (!rec)                      return res.status(400).json({ ok:false, message:"לא נשלח קוד" });
    if (rec.expires < Date.now()) { delete emailOtpStore[ce]; return res.status(400).json({ ok:false, message:"קוד פג תוקף" }); }
    if (rec.code !== String(code)) return res.status(400).json({ ok:false, message:"קוד שגוי" });

    // 🧷 Idempotency guard: אם כבר נוצל - רק לחבר ולהחזיר
    if (rec.used) {
      const existingUser = await User.findOne({ email: ce });
      if (!existingUser || !existingUser.TenantID) {
        return res.status(409).json({ ok:false, message:"הקוד כבר נוצל. נסה לשלוח קוד חדש." });
      }
      signAuthCookie(res, { userId: existingUser._id, tenantId: existingUser.TenantID, role: "owner" });
      return res.json({ ok:true, redirect: roleHomeFor(existingUser) });
    }

    // 🧑‍💼 User upsert (מונע מירוץ כפול)
    const baseName = (rec.name || ce.split("@")[0]).trim();
    const initUsername = `${baseName}-${Math.floor(Math.random()*10000)}`;
    let user = await User.findOneAndUpdate(
      { email: ce },
      {
        $setOnInsert: {
          username: initUsername,
          name: rec.name,
          role: "user",
          TenantName: rec.tenantName,
          memberships: []
        }
      },
      { upsert: true, new: true }
    );

    // 🔁 בדוק אם כבר יש עסק בבעלות המשתמש בשם הזה (מניעת כפילויות)
    const tenantName = rec.tenantName || `${rec.name || "עסק חדש"} ${Date.now()}`;
    let tenant = await Tenant.findOne({ owner: user._id, name: tenantName });

    if (!tenant) {
      // slug ייחודי; אם יש מירוץ ו-E11000 על slug – נסה מחדש עם סיומת
      const createTenantSafe = async () => {
        const trySlug = await uniqueTenantSlug(tenantName);
        try {
          return await Tenant.create({
            name: tenantName,
            slug: trySlug,
            owner: user._id,
            settings: { phone: rec.tenantPhone || "" }
          });
        } catch (e) {
          if (e?.code === 11000) {
            return await Tenant.create({
              name: tenantName,
              slug: `${trySlug}-${Math.random().toString(36).slice(2,5)}`,
              owner: user._id,
              settings: { phone: rec.tenantPhone || "" }
            });
          }
          throw e;
        }
      };
      tenant = await createTenantSafe();
    }

    // 👥 שייך את המשתמש לבעלות אם טרם משויך
    const alreadyMember = (user.memberships || []).some(m => String(m.tenant) === String(tenant._id));
    if (!alreadyMember) {
      user.memberships = Array.isArray(user.memberships) ? user.memberships : [];
      user.memberships.push({ tenant: tenant._id, role: 'owner' });
    }
    user.TenantID = tenant._id;
    user.TenantName = tenant.name;
    await user.save();

    // ✅ סמן שה-OTP נוצל ומחק מאחסון הזמני
    rec.used = true;
    delete emailOtpStore[ce];

    // 🍪 התחברות
    signAuthCookie(res, { userId: user._id, tenantId: tenant._id, role: "owner" });
    return res.json({ ok:true, message:"מחובר!", redirect: roleHomeFor(user) });
  } catch (err) {
    console.error("verify-email-code error:", err);
    return res.status(500).json({ ok:false, message:"שגיאה באימות" });
  }
});


// יצירת עסק לבעלים על-ידי צוות (ללא התחברות של היוצר)
app.post("/auth/create", async (req, res) => {
  try {
    const { email } = req.body || {};
    const ce = cleanEmail(email);
    const rec = emailOtpStore[ce]; // ה־store הזמני מהבקשה בחלון

    if (!isEmail(ce)) return res.status(400).json({ ok:false, message: "אימייל לא תקין" });
    if (!rec)        return res.status(400).json({ ok:false, message: "חסר מידע יצירה (שלח שוב טופס)" });

    // 1) יוצרים/מאחזרים את בעל העסק לפי האימייל שהוזן בחלון
    const baseName = (rec.name || ce.split("@")[0]).trim();
    const initUsername = `${baseName}-${Math.floor(Math.random()*10000)}`;

    let ownerUser = await User.findOneAndUpdate(
      { email: ce },
      {
        $setOnInsert: {
          username: initUsername,
          name: rec.name,
          role: "user",
          TenantName: rec.tenantName,
          memberships: []
        }
      },
      { upsert: true, new: true }
    );

    // 2) יוצר Tenant חדש בבעלות ownerUser (Idempotent בשם)
    const tenantName = rec.tenantName || `${rec.name || "עסק חדש"} ${Date.now()}`;
    let tenant = await Tenant.findOne({ owner: ownerUser._id, name: tenantName });
    if (!tenant) {
      const createTenantSafe = async () => {
        const trySlug = await uniqueTenantSlug(tenantName);
        try {
          return await Tenant.create({
            name: tenantName,
            slug: trySlug,
            owner: ownerUser._id,
            settings: { phone: rec.tenantPhone || "" }
          });
        } catch (e) {
          if (e?.code === 11000) {
            return await Tenant.create({
              name: tenantName,
              slug: `${trySlug}-${Math.random().toString(36).slice(2,5)}`,
              owner: ownerUser._id,
              settings: { phone: rec.tenantPhone || "" }
            });
          }
          throw e;
        }
      };
      tenant = await createTenantSafe();
    }

    // 3) הקפד שבעל העסק משויך כ-owner (בלי לגעת במשתמש שמחובר כרגע!)
    const alreadyOwner = (ownerUser.memberships || []).some(m => String(m.tenant) === String(tenant._id));
    if (!alreadyOwner) {
      ownerUser.memberships = Array.isArray(ownerUser.memberships) ? ownerUser.memberships : [];
      ownerUser.memberships.push({ tenant: tenant._id, role: 'owner' });
    }
    // לא משנים ownerUser.TenantID כאן בכוונה; הוא יקבע בעצמו בעת התחברות ראשונה
    await ownerUser.save();

    // 4) שליחת הזמנה לבעל העסק להשלים הרשמה/סיסמה (ממחזר את Invite)
    const token = require('crypto').randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000);
    await Invite.create({
      tenant: tenant._id,
      email: ce,
      role: 'owner',
      token,
      expiresAt,
      createdBy: (req.user?._id || null)
    }); // תואם לזרימת ההזמנות שלך:contentReference[oaicite:1]{index=1}

    const baseUrl = process.env.BASE_URL || 'https://your-app-url';
    const inviteUrl = `${baseUrl}/login?invite=${encodeURIComponent(token)}`;

    try {
      await mailer.sendMail({
        from: `"New Deli" <${process.env.SMTP_USER}>`,
        to: ce,
        subject: `הוזמנת כבעל העסק ל-${tenant.name}`,
        text: `שלום ${rec.name || ''},\n\nנוצר עבורך עסק חדש: ${tenant.name}.\nלהשלמת יצירה/הגדרת סיסמה והתחברות:\n${inviteUrl}\n\nהלינק תקף ל-7 ימים.`,
      });
    } catch (e) {
      console.error('owner invite mail failed:', e.message);
    }

    // 5) נקה זיכרון זמני
    rec.used = true;
    delete emailOtpStore[ce];

    // 6) החזרה: לא מחברים אף אחד. רק סטטוס ו־IDs לשימוש UI
    return res.json({
      ok: true,
      message: "העסק נוצר. הזמנה נשלחה לבעל העסק במייל.",
      tenant: { id: String(tenant._id), name: tenant.name },
      owner:  { id: String(ownerUser._id), email: ownerUser.email }
    });
  } catch (err) {
    console.error("auth/create error:", err);
    return res.status(500).json({ ok:false, message:"שגיאה ביצירת העסק" });
  }
});




// ===== AUTH: Employee login + forgot/reset =====
// ===== Unified login: /auth/login (and keep /auth/employee/login for compatibility) =====
const unifiedLoginHandler = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const ce = cleanEmail(email);
    if (!isEmail(ce) || !password || String(password).length < 6) {
      return res.status(400).json({ ok:false, message:"אימייל/סיסמה לא תקינים" });
    }

    const user = await User.findOne({ email: ce });
    if (!user || !user.passwordHash) {
      return res.status(400).json({ ok:false, message:"משתמש לא נמצא או שאין סיסמה" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok:false, message:"סיסמה שגויה" });

    // ---------- resolve active tenant & role ----------
    let tenantId = user.TenantID;
    let role = null;

    // אם יש TenantID קיים – נוודא שהוא באמת קשור למשתמש (כבעלים או כחבר צוות)
    if (tenantId) {
      const isOwnerOfActive = await Tenant.exists({ _id: tenantId, owner: user._id });
      const memRoleActive = (user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role || null;
      if (isOwnerOfActive) role = 'owner';
      else if (memRoleActive) role = memRoleActive;
      else {
        // לא באמת שייך → ננקה ונחפש אחרת
        tenantId = undefined;
      }
    }
    if (!tenantId) {
      const owned = await Tenant.findOne({ owner: user._id }).select("_id");
      if (owned) {
        tenantId = owned._id;
        role = 'owner';
      }
    }
    if (!tenantId) {
      const m = (user.memberships || [])[0];
      if (m) {
        tenantId = m.tenant;
        role = m.role || 'employee';
      }
    }

    // אם אין כלום – המשתמש לא משויך ולא בעל עסק
    if (!tenantId) {
      // 200 כדי שה-UI יוכל להציג מצב מיוחד, לא "שגיאה".
      return res.status(200).json({
        ok: false,
        code: "NO_TENANT",
        message: "לא משויך לעסק ולא בעל עסק"
      });
    }

    // אם עדיין אין role – נקבע לפי ממברשיפ או בעלות
    if (!role) {
      const memRole = (user.memberships || []).find(m => String(m.tenant) === String(tenantId))?.role;
      role = memRole || (await Tenant.exists({ _id: tenantId, owner: user._id }) ? 'owner' : 'employee');
    }

    // נשמור TenantID פעיל למשתמש אם השתנה
    if (!user.TenantID || String(user.TenantID) !== String(tenantId)) {
      user.TenantID = tenantId;
      await user.save();
    }

    // חתימת קוקה ויציאה לדשבורד ("/" כבר מפנה ל-/manager או /worker לפי תפקיד)
    signAuthCookie(res, { userId: user._id, tenantId, role });
    return res.json({ ok:true, redirect:"/" });
  } catch (e) {
    console.error("unified login error:", e);
    res.status(500).json({ ok:false, message:"Server error" });
  }
};

app.post("/auth/login", authLimiter, unifiedLoginHandler);
// תאימות לאחור: מי שקורא לנתיב הישן יקבל אותה לוגיקה
app.post("/auth/employee/login", authLimiter, unifiedLoginHandler);

app.post("/auth/employee/reset", authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 6) {
      return res.status(400).json({ ok:false, message:"טוקן/סיסמה לא תקינים" });
    }
    const rec = passwordResetStore[token];
    if (!rec || rec.expires < Date.now()) { delete passwordResetStore[token]; return res.status(400).json({ ok:false, message:"טוקן לא תקף" }); }
    const user = await User.findOne({ email: rec.email });
    if (!user) { delete passwordResetStore[token]; return res.status(400).json({ ok:false, message:"משתמש לא קיים" }); }
    user.passwordHash = await bcrypt.hash(password, 10);
    await user.save();
    delete passwordResetStore[token];
    res.json({ ok:true, message:"הסיסמה עודכנה. אפשר להתחבר." });
  } catch (e) {
    console.error("employee/reset error:", e);
    res.status(500).json({ ok:false, message:"Server error" });
  }
});

// ===== Admin tenants features =====
app.put("/api/admin/tenants/:id/features",
  requireTeamAccess, async (req, res) => {
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
  }
);

// ===== Team: create/add member =====
app.post('/api/team/members', requireTeamManager, async (req, res) => {
  let { name, email, role = 'employee', sendInvite = true } = req.body || {};
  email = String(email).trim().toLowerCase();

  // ולידציה
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ ok:false, message:'Invalid email' });
  
  const tenantId = req.user.TenantID;
  const tenantName = req.user.TenantName;
  const baseUrl = process.env.BASE_URL || 'https://your-app-url';
  
  let user = await User.findOne({ email });

  // אם קיים
  if (user) {
    const alreadyMember = user.memberships?.some(m => String(m.tenant) === String(tenantId));
    if (alreadyMember) return res.status(409).json({ ok:false, message:'User already belongs to this tenant' });
    
    user.memberships.push({ tenant: tenantId, role });
    await user.save();
  } else {
    // יצירת משתמש חדש
    user = await User.create({
      name,
      email,
      role,
      TenantID: tenantId,
      TenantName: tenantName,
      memberships: [{ tenant: tenantId, role }]
    });

    // שליחת הזמנה במייל
    if (sendInvite) {
      const subject = `קיבלת גישה ל-${tenantName}`;
      const html = `<p>שלום ${name},</p>
                    <p>הוזמנת להצטרף ל-${tenantName} במערכת.</p>
                    <a href="${baseUrl}/register?email=${encodeURIComponent(email)}">כניסה להרשמה</a>`;
      await mailer.sendMail({ to: email, subject, html });
    }
  }

  return res.json({ ok: true, member: { id: user.id, name, email, role } });
});

// ===== Team: update =====
app.put('/api/team/members/:id', authenticateUser, async (req, res) => {
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


// ===== Team: delete (remove membership) =====
app.delete('/api/users/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId   = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'Missing tenant context' });

    const editorRole = getRoleForTenant(req.user, tenantId);
    if (!editorRole || !['owner','manager'].includes(editorRole)) {
      return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק עובדים' });
    }

    const { id } = req.params;
    const target = await User.findById(id);
    if (!target) return res.status(404).json({ ok:false, message:'משתמש לא נמצא' });

    const memIdx = (target.memberships || []).findIndex(m => String(m.tenant) === String(tenantId));
    if (memIdx === -1) return res.status(404).json({ ok:false, message:'המשתמש אינו שייך לעסק זה' });

    const targetRole = target.memberships[memIdx].role;
    if (targetRole === 'owner') return res.status(403).json({ ok:false, message:'אסור למחוק בעל העסק' });
    if (editorRole === 'manager' && targetRole === 'manager') {
      return res.status(403).json({ ok:false, message:'מנהל לא יכול למחוק מנהל' });
    }

    target.memberships.splice(memIdx, 1);
    if (!target.memberships.length) { target.TenantID = undefined; target.TenantName = undefined; }
    await target.save();
    res.json({ ok:true });
  } catch (e) {
    console.error('DELETE /api/users/:id', e);
    res.status(500).json({ ok:false, message:'Server error' });
  }
});

// ===== Logs =====
app.get('/api/logs', authenticateUser, async (req, res) => {
  try {
    const myRole = getRoleForTenant(req.user, req.user.TenantID) || 'employee';
    if (!['owner','manager','shift_manager'].includes(myRole)) {
      return res.status(403).json({ ok:false, message:'אין הרשאה לצפייה ביומן' });
    }
    const limit = Math.min(parseInt(req.query.limit || 30, 10), 100);
    const since = req.query.since ? new Date(req.query.since) : null;
    const q = { tenant: req.user.TenantID };
    if (since) q.createdAt = { $gte: since };

    const logs = await ActivityLog.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ ok:true, logs: logs.map(l => ({
      id:l._id, action:l.action, createdAt:l.createdAt,
      actor:{ id:l.actor, name:l.actorName, email:l.actorEmail }, target:l.target, meta:l.meta
    }))});
  } catch (e) {
    console.error('GET /api/logs error:', e);
    res.status(500).json({ ok:false, message:'שגיאה בטעינת הלוגים' });
  }
});

// ===== Tenant info =====
function plainFeatures(f) {
  if (!f) return {};
  if (f instanceof Map) return Object.fromEntries(f);
  if (typeof f === 'object') return f;
  return {};
}

app.get('/api/tenant/info', authenticateUser, async (req, res) => {
  try {
    const user   = req.user;
    const tenant = await Tenant.findById(user.TenantID).lean();
    if (!tenant) return res.status(404).json({ ok:false, message:'עסק לא נמצא' });

    const featureState = Object.fromEntries(
      Object.keys(FEATURE_CATALOG || {}).map(k => [k, !!(tenant.features && tenant.features.get && tenant.features.get(k))])
    );

    const teamMembers = await User.find({ TenantID: tenant._id }).select('name email role memberships').lean();
    const owner = teamMembers.find(m =>
      m.memberships?.some(mem => String(mem.tenant) === String(tenant._id) && mem.role === 'owner')
    ) || null;

    res.json({
      ok: true,
      tenant: {
        id: tenant._id, name: tenant.name, createdAt: tenant.createdAt,
        settings: tenant.settings, features: plainFeatures(tenant.features)
      },
      featureState,
      currentUser: {
        id: user._id, name: user.name, email: user.email,
        role: user.memberships?.find(m => String(m.tenant) === String(tenant._id))?.role || 'staff'
      },
      owner: owner ? { name: owner.name, email: owner.email } : null,
      teamMembers: teamMembers.map(m => ({
        id: m._id, name: m.name, email: m.email,
        role: m.memberships?.find(mm => String(mm.tenant) === String(tenant._id))?.role || 'staff'
      }))
    });
  } catch (e) {
    console.error('tenant/info error:', e);
    res.status(500).json({ ok:false, message:'שגיאה בטעינת נתוני העסק' });
  }
});

// ===== Invoices =====
app.post('/api/invoices/upload',
  authenticateUser, requireTenantFeature('invoices'), upload.single('file'),
  async (req, res) => {
    try {
      const tenantId   = req.user.TenantID;
      if (!tenantId) return res.status(400).json({ ok:false, message:'חסרה זיקה לעסק' });
      if (!req.file)  return res.status(400).json({ ok:false, message:'לא נבחר קובץ' });
      const description = clean(req.body?.description);
      if (!description) return res.status(400).json({ ok:false, message:'יש להזין תיאור' });

      const streamUpload = (buffer) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: CLOUD_FOLDER, resource_type: 'auto' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(buffer);
      });
      const up = await streamUpload(req.file.buffer);
      const number = await nextInvoiceNumber(tenantId);

      const inv = await Invoice.create({
        tenant: tenantId, number,
        uploadedBy: req.user._id, uploadedByN: req.user.name,
        description,
        originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size,
        file: {
          public_id: up.public_id, url: up.secure_url || up.url, format: up.format,
          resource_type: up.resource_type, bytes: up.bytes, width: up.width, height: up.height,
          original_filename: up.original_filename
        }
      });

      await log(req, 'invoice:upload', { kind:'Invoice', id:String(inv._id), label:inv.description }, { description });

      res.json({ ok:true,
        id: inv._id, url: inv.file?.url, originalname: inv.originalname,
        username: inv.uploadedByN, mimetype: inv.mimetype, size: inv.size,
        description: inv.description, uploadedAt: inv.createdAt
      });
    } catch (e) {
      console.error('upload invoice error:', e);
      res.status(500).json({ ok:false, message: e.message || 'שגיאה בהעלאה' });
    }
  }
);

app.delete('/api/invoices/:id', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const { id }   = req.params;
    const inv = await Invoice.findById(id);
    if (!inv) return res.status(404).json({ ok:false, message:'חשבונית לא נמצאה' });
    if (String(inv.tenant) !== String(tenantId)) return res.status(403).json({ ok:false, message:'אין לך גישה לחשבונית זו' });

    const myRole = getRoleForTenant(req.user, tenantId);
    const isUploader = String(inv.uploadedBy) === String(req.user._id);
    if (!['owner','manager','shift_manager'].includes(myRole) && !isUploader) {
      return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק חשבונית זו' });
    }

    try {
      if (inv.file?.public_id) {
        const rtype = inv.file?.resource_type || (String(inv.mimetype||'').includes('pdf') ? 'raw' : 'image');
        await cloudinary.uploader.destroy(inv.file.public_id, { resource_type: rtype });
      }
    } catch (e) { console.warn('cloudinary destroy failed:', e.message); }

    await log(req, 'invoice:delete',
      { kind:'Invoice', id:String(inv._id), label: inv.description || inv.originalname, url: inv.file?.url },
      { size: inv.size, mimetype: inv.mimetype }
    );

    await Invoice.deleteOne({ _id: inv._id });
    res.json({ ok:true });
  } catch (e) {
    console.error('delete invoice error:', e);
    res.status(500).json({ ok:false, message:'שגיאה במחיקה' });
  }
});

app.get('/api/invoices/search', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const q = clean(req.query.q || '');
    const cond = { tenant: tenantId };
    if (q) cond.description = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const items = await Invoice.find(cond).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ ok:true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, message: 'שגיאה בחיפוש' });
  }
});

app.get('/api/invoices/list', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const items = await Invoice.find({ tenant: tenantId })
      .sort({ createdAt: -1 }).select('number description uploadedByN createdAt file.url').lean();
    res.json({ ok:true, invoices: items.map(x => ({
      id:String(x._id), number:x.number ?? null, description:x.description || '',
      uploader:x.uploadedByN || '', at:x.createdAt, url:x.file?.url || null
    }))});
  } catch (e) {
    console.error('invoices/list error:', e);
    res.status(500).json({ ok:false, message:'שגיאה בטעינת חשבוניות' });
  }
});

// ===== Who am I =====
app.get("/me", authenticateUser, async (req, res) => {
  try {
    const u = await User.findById(req.auth.id).select("_id email name TenantID platformRole memberships").lean();
    let tenant = null, role = req.auth.role || "employee";
    if (req.auth.TenantID) {
      tenant = await Tenant.findById(req.auth.TenantID).select("_id name owner").lean();
      if (tenant && String(tenant.owner) === String(u._id)) role = "owner";
    }
    res.json({ ok:true, user:u, currentTenant: tenant, role, isPlatformAdmin: isPlatformAdmin(u) });
  } catch (e) {
    console.error("/me error:", e);
    res.status(500).json({ ok:false, message:"Server error" });
  }
});

// ===== Update user name =====
app.put("/api/user/update", authenticateUser, async (req, res) => {
  try {
    const cleanName = clean(req.body?.name);
    if (!cleanName) return res.status(400).json({ ok:false, message:"יש להזין שם מלא" });
    if (cleanName.length > 80) return res.status(400).json({ ok:false, message:"שם ארוך מדי" });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok:false, message:"משתמש לא נמצא" });
    user.name = cleanName; await user.save();
    res.json({ ok:true, message:"הפרופיל עודכן בהצלחה", user:{ id:user._id, name:user.name, email:user.email }});
  } catch (err) {
    console.error("user/update error:", err);
    res.status(500).json({ ok:false, message:"שגיאה בעדכון הפרופיל" });
  }
});

// ===== Admin tenants list =====
app.get("/api/admin/tenants", requireTeamAccess, async (req, res) => {
  const tenants = await Tenant.find({}).select("name createdAt owner settings features")
    .populate({ path:"owner", select:"name email" }).lean();
  res.json({ ok:true, tenants: tenants.map(t => ({
    id:String(t._id), name:t.name, createdAt:t.createdAt,
    owner: t.owner ? { name:t.owner.name, email:t.owner.email } : null,
    settings:t.settings || {}, features: t.features || {}
  }))});
});

// ===== Tenant update (owner/manager) =====
app.put("/api/tenant/update", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const { name, settings } = req.body || {};
    const membership = user.memberships?.find(m => String(m.tenant) === String(user.TenantID));
    if (!membership || !['owner','admin'].includes(membership.role)) {
      return res.status(403).json({ ok:false, message:"אין הרשאה לעדכן פרטי העסק" });
    }
    const tenant = await Tenant.findById(user.TenantID);
    if (!tenant) return res.status(404).json({ ok:false, message:"עסק לא נמצא" });
    if (name) tenant.name = clean(name);
    if (settings) tenant.settings = { ...tenant.settings, ...settings };
    await tenant.save();
    res.json({ ok:true, message:"העסק עודכן בהצלחה", tenant:{ id:tenant._id, name:tenant.name, settings:tenant.settings }});
  } catch (err) {
    console.error("tenant/update error:", err);
    res.status(500).json({ ok:false, message:"שגיאה בעדכון העסק" });
  }
});
// ↑ בראש הקובץ
const XLSX = require("xlsx");

// ↓ אחרי הראוטים הקיימים של invoices
app.get("/api/invoices/export", authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const { month } = req.query;
    if (!tenantId || !month)
      return res.status(400).json({ ok: false, message: "חודש לא נבחר" });

    const [year, mon] = month.split("-");
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 1);

    const invoices = await Invoice.find({
      tenant: tenantId,
      createdAt: { $gte: start, $lt: end }
    }).lean();

    if (!invoices.length)
      return res.status(404).json({ ok: false, message: "אין חשבוניות בחודש זה" });

    const rows = invoices.map(inv => ({
      מספר: inv.number,
      תיאור: inv.description || "",
      העלה: inv.uploadedByN,
      תאריך: new Date(inv.createdAt).toLocaleDateString("he-IL"),
      גודל: `${(inv.size / 1024).toFixed(1)} KB`,
      קובץ: inv.file?.url || ""
    }));

    // יצירת sheet רגיל
    const ws = XLSX.utils.json_to_sheet(rows);

    // החלפת טקסט בעמודת הקובץ לקישור לחיץ
    invoices.forEach((inv, i) => {
      const cellAddress = XLSX.utils.encode_cell({ r: i + 1, c: 5 }); // טור 5 (אינדקס 0-based)
      const url = inv.file?.url;
      if (url) {
        ws[cellAddress] = {
          t: "s",
          v: "פתח קובץ",
          l: { Target: url, Tooltip: "לחץ לפתיחת הקובץ" }
        };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "חשבוניות");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoices-${month}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buf);
  } catch (e) {
    console.error("export invoices error:", e);
    res
      .status(500)
      .json({ ok: false, message: "שגיאת שרת ביצוא החשבוניות" });
  }
});


// ===== Logout =====
app.post("/logout", (req, res) => {
  res.clearCookie("token", { sameSite:"none", secure:true, httpOnly:true, path:"/" });
  res.clearCookie("user",  { sameSite:"lax" });
  res.json({ ok:true, message:"התנתקת בהצלחה" });
});
app.get("/logout", (req, res) => {
  res.clearCookie("token", { sameSite:"none", secure:true, httpOnly:true, path:"/" });
  res.clearCookie("user",  { sameSite:"lax" });
  return res.redirect("/login");
});
app.get(/^\/(?!login\/?$|manager\/?$|worker\/?$).+/, (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});
// ===== Errors =====
app.use((err, req, res, next) => {
  console.error("🔥 Express Error:", err);
  res.status(500).json({ ok:false, message:"Server error", error: err.message });
});

// ===== Start / Export (Vercel) =====
const vercel = false; // אם מריצים על Vercel כ-Serverless function, שנה ל-true וייצא את app
if (vercel) {
  module.exports = app;
} else {
  app.listen(PORT, () => console.log(`🚀 Server listening on :${PORT}`));
}
