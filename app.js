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

// -------------------------
// Core app hardening & basics
// -------------------------
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(hpp());

// Lightweight request timers (dev only)
app.use((req, res, next) => {
  if (!isProd) {
    const tag = `${req.method} ${req.url}`;
    console.time(tag);
    res.on("finish", () => console.timeEnd(tag));
    if (/\.(html|css|js)$/.test(req.url))
      res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// Helmet CSP – aligned to current external deps
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://www.gstatic.com",
          "https://www.googleapis.com",
          "https://www.google.com",
          "https://apis.google.com",
          "https://www.recaptcha.net",
          "https://cdn.jsdelivr.net",
          "https://vercel.live",
          "https://*.vercel.live",
        ],
        connectSrc: [
          "'self'",
          "https://www.gstatic.com",
          "https://www.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://www.recaptcha.net",
          "https://cdn.jsdelivr.net",
          "https://vercel.live",
          "https://*.vercel.live",
          "wss://vercel.live",
          "wss://*.vercel.live",
        ],
        frameSrc: [
          "'self'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://www.recaptcha.net",
          "https://vercel.live",
          "https://*.vercel.live",
        ],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
      },
    },
  }),
);

// CORS – restrict to known origins (extend via env if needed)
const ALLOWED_ORIGINS = [
  "https://verce-ltestv-1.vercel.app",
  "http://localhost:4000",
];
if (process.env.CORS_ORIGINS) {
  ALLOWED_ORIGINS.push(
    ...process.env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients / curl with no origin
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);

// -----------
// Static files
// -----------
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProd ? "1d" : 0,
    etag: !isProd ? false : true,
    lastModified: !isProd ? false : true,
    extensions: ["html"],
  }),
);

// -----------------------------------
// Mongo connection – ensure on demand
// -----------------------------------
async function ensureDb() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  )
    return;
  await connectMongoose();
}

// Initial connect (non-blocking)
(async () => {
  try {
    await ensureDb();
    console.log("✅ Mongo connected");
  } catch (e) {
    console.error("❌ Initial Mongo connect failed:", e);
  }
})();

// Per-request guard (only if needed)
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    return next();
  } catch (err) {
    console.error("DB connect failed:", err);
    return res.status(503).json({ ok: false, message: "Database unavailable" });
  }
});

// --------------------
// Rate limiting (APIs)
// --------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15m
  max: 500, // tune per need
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(["/api", "/auth"], apiLimiter);

// -------
// CSRF
// -------
const csrfProtection = csrf({ cookie: CSRF_COOKIE });
app.use(csrfProtection);
app.get("/csrf-token", (req, res) => res.json({ csrfToken: req.csrfToken() }));

// ------------------
// Auth & view routes
// ------------------
const { authenticateUser, requireRoles } = require("./middlewares/auth");
function redirectByRole(req, res) {
  const { getRoleForTenant } = require("./middlewares/auth");
  const role = getRoleForTenant(req.user, req.user?.TenantID);
  if (["owner", "manager", "shift_manager"].includes(role))
    return res.redirect("/manager");
  return res.redirect("/worker");
}

app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "views", "login.html")),
);
app.get("/", authenticateUser, redirectByRole);
app.get(
  "/manager",
  authenticateUser,
  requireRoles(["owner", "manager", "shift_manager"]),
  (req, res) => res.sendFile(path.join(__dirname, "views", "manager.html")),
);
app.get("/worker", authenticateUser, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "worker.html")),
);
app.get("/admin", (req, res, next) => {
  const { requireTeamAccess } = require("./middlewares/auth");
  return requireTeamAccess(req, res, () =>
    res.sendFile(path.join(__dirname, "views", "admin.html")),
  );
});

// --------------
// API mountpoint
// --------------
["team","invoices","dispersions","suppliers","orders","tenant"].forEach(r => {
  app.use("/api", require(`./routes/${r}`));
});
app.use("/auth", require("./routes/auth"));
app.use("/", require("./routes/misc"));

// ----------
// Healthcheck
// ----------
app.get("/healthz", (req, res) =>
  res.json({ ok: true, uptime: process.uptime() }),
);

// -------------------------------------------------
// 404 for non-view routes (keep custom 404 page)
// -------------------------------------------------
// app.get(/^\/(?!login\/?$|manager\/?$|worker\/?$).+/, (req, res) => {
//   res.status(404).sendFile(path.join(__dirname, "views", "404.html"));
// });

// -------------
// Error handlers
// -------------
app.use((err, req, res, next) => {
  // CSRF errors => 403 with hint
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ ok: false, message: "Bad CSRF token" });
  }
  console.error("🔥 Express Error:", err);
  return res
    .status(500)
    .json({
      ok: false,
      message: "Server error",
      error: isProd ? undefined : err.message,
    });
});

module.exports = app;
