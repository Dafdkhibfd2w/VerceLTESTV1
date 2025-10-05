const jwt = require("jsonwebtoken");
const path = require("path");
const User = require("../../models/user");
const { setTenantContext } = require("./tenantContext"); // תוודא שהנתיב נכון למודל שלך
const SECRET = process.env.JWT_SECRET || "supersecret";
function requireAuth(role) {
  return async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
      return res.redirect("/login"); // 🛑 לא מחובר בכלל
    }
    try {
      const decoded = jwt.verify(token, SECRET);
      const user = await User.findById(decoded.id).lean();
      if (!user) {
        res.clearCookie("token");
        return res.redirect("/login");
      }
      req.user = user;
      if (user && user.activeTenant) setTenantContext(user.activeTenant);
      if (role && user.role !== role) {
        return res
          .status(403)
          .sendFile(path.join(__dirname, "..", "..", "views", "unauthorized.html"));
      }
      next();
    } catch (err) {
      console.error("❌ invalid token:", err.message);
      res.clearCookie("token");
      return res.redirect("/login");
    }
  };
}

module.exports = { requireAuth };
