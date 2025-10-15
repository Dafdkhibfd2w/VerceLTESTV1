require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const csrf = require("csurf");
const mongoose = require("mongoose");

const { connectMongoose } = require("./db");
const { CSRF_COOKIE } = require("./config/cookie");

const app = express();
const isProd = process.env.NODE_ENV === "production";

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

// Dev timers + no-cache on assets
app.use((req, res, next) => {
  const tag = `${req.method} ${req.url}`;
  console.time(tag);
  res.on('finish', () => console.timeEnd(tag));
  if (/\.(html|css|js)$/.test(req.url)) res.setHeader("Cache-Control", "no-store");
  next();
});

// Helmet
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

// CORS
app.use(cors({
  origin: [
    "https://verce-ltestv-1.vercel.app",
    "http://localhost:4000"
  ],
  credentials: true
}));

// Mongo connection
mongoose.set('bufferCommands', false);
(async () => {
  try { await connectMongoose(); console.log("✅ Mongo connected"); }
  catch (e) { console.error("❌ Mongo connect failed:", e); }
})();
app.use(async (req, res, next) => {
  try { await connectMongoose(); next(); }
  catch (err) { console.error('DB connect failed:', err); res.status(503).json({ ok:false, message:'Database unavailable' }); }
});

// CSRF
const csrfProtection = csrf({ cookie: CSRF_COOKIE });
app.use(csrfProtection);
app.get("/csrf-token", (req, res) => res.json({ csrfToken: req.csrfToken() }));

// Views
const { authenticateUser, requireRoles } = require("./middlewares/auth");
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "views", "login.html")));
app.get('/', authenticateUser, (req, res) => {
  const { getRoleForTenant } = require("./middlewares/auth");
  const role = getRoleForTenant(req.user, req.user.TenantID);
  if (['owner','manager','shift_manager'].includes(role)) return res.redirect('/manager');
  return res.redirect('/worker');
});
app.get('/manager', authenticateUser, requireRoles(['owner','manager','shift_manager']), (req, res) => res.sendFile(path.join(__dirname, 'views', 'manager.html')));
app.get('/worker',  authenticateUser, (req, res) => res.sendFile(path.join(__dirname, 'views', 'worker.html')));
app.get('/admin',  (req, res, next) => {
  const { requireTeamAccess } = require("./middlewares/auth");
  return requireTeamAccess(req, res, () => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
});

// API routes
app.use("/api", require("./routes/team"));
app.use("/api", require("./routes/invoices"));
app.use('/api', require('./routes/dispersions'));
app.use("/api", require("./routes/suppliers"));
app.use("/api", require("./routes/orders"));

app.use("/api", require("./routes/tenant"));
app.use("/auth", require("./routes/auth"));
app.use("/",    require("./routes/misc"));

// 404 for all other non-view routes
app.get(/^\/(?!login\/?$|manager\/?$|worker\/?$).+/, (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Errors
app.use((err, req, res, next) => {
  console.error("🔥 Express Error:", err);
  res.status(500).json({ ok:false, message:"Server error", error: err.message });
});

module.exports = app;
