const isProd = process.env.NODE_ENV === "production";
module.exports = {
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: true,          // HTTPS on Vercel/Prod
    sameSite: "none",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7
  },
  CSRF_COOKIE: { httpOnly: true, sameSite: "lax", secure: isProd }
};
