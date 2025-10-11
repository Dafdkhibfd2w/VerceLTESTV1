const express = require("express");
const { authenticateUser, isPlatformAdmin } = require("../middlewares/auth");
const Tenant = require("../models/Tenant");
const User = require("../models/user");

const router = express.Router();

router.get("/me", authenticateUser, async (req, res) => {
  try {
    const u = await User.findById(req.auth.id).select("_id email name TenantID platformRole memberships").lean();
    let tenant = null, role = req.auth.role || "employee";
    if (req.auth.TenantID) {
      tenant = await Tenant.findById(req.auth.TenantID).select("_id name owner").lean();
      if (tenant && String(tenant.owner) === String(u._id)) role = "owner";
    }
    res.json({ ok:true, user:u, currentTenant: tenant, role, isPlatformAdmin: isPlatformAdmin(u) });
  } catch (e) { console.error("/me error:", e); res.status(500).json({ ok:false, message:"Server error" }); }
});

router.put("/api/user/update", authenticateUser, async (req, res) => {
  try {
    const cleanName = String(req.body?.name || "").trim();
    if (!cleanName) return res.status(400).json({ ok:false, message:"יש להזין שם מלא" });
    if (cleanName.length > 80) return res.status(400).json({ ok:false, message:"שם ארוך מדי" });
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ ok:false, message:"משתמש לא נמצא" });
    user.name = cleanName; await user.save();
    res.json({ ok:true, message:"הפרופיל עודכן בהצלחה", user:{ id:user._id, name:user.name, email:user.email }});
  } catch (err) { console.error("user/update error:", err); res.status(500).json({ ok:false, message:"שגיאה בעדכון הפרופיל" }); }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token", { sameSite:"none", secure:true, httpOnly:true, path:"/" });
  res.clearCookie("user",  { sameSite:"lax" });
  res.json({ ok:true, message:"התנתקת בהצלחה" });
});
router.get("/logout", (req, res) => {
  res.clearCookie("token", { sameSite:"none", secure:true, httpOnly:true, path:"/" });
  res.clearCookie("user",  { sameSite:"lax" });
  return res.redirect("/login");
});

module.exports = router;
