const express = require("express");
const { authenticateUser, isPlatformAdmin, requireTeamAccess } = require("../middlewares/auth");
const Tenant = require("../models/Tenant");
const User = require("../models/user");

const router = express.Router();

function plainFeatures(f) {
  if (!f) return {};
  if (f instanceof Map) return Object.fromEntries(f);
  if (typeof f === 'object') return f;
  return {};
}

router.get('/tenant/info', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const tenant = await Tenant.findById(user.TenantID).lean();
    if (!tenant) return res.status(404).json({ ok:false, message:'עסק לא נמצא' });

    // Get feature state
    const FEATURE_CATALOG = require("../config/featureCatalog");
    const featureState = Object.fromEntries(
      Object.keys(FEATURE_CATALOG || {}).map(k => 
        [k, !!(tenant.features && tenant.features.get && tenant.features.get(k))]
      )
    );

    // Get ALL team members with their roles
    const teamMembers = await User.find({
      'memberships.tenant': tenant._id
    }).select('name email memberships').lean();

    // Get pending invites
    const Invite = require("../models/Invite");
    const pendingInvites = await Invite.find({
      tenant: tenant._id,
      expiresAt: { $gt: new Date() }
    }).lean();

    // Find owner
    const owner = teamMembers.find(m => 
      m.memberships?.some(mem => 
        String(mem.tenant) === String(tenant._id) && 
        mem.role === 'owner'
      )
    ) || null;

    // Combine active members and pending invites
    const combinedTeam = [
      // Active members
      ...teamMembers.map(m => ({
        id: m._id,
        name: m.name,
        email: m.email,
        role: m.memberships?.find(mm => 
          String(mm.tenant) === String(tenant._id)
        )?.role || 'employee',
        status: 'active',
        type: 'member'
      })),
      // Pending invites
      ...pendingInvites.map(inv => ({
        id: inv._id,
        name: inv.email.split('@')[0],
        email: inv.email,
        role: inv.role || 'employee',
        status: 'pending',
        type: 'invite'
      }))
    ];

    res.json({
      ok: true,
      tenant: { 
        id: tenant._id, 
        name: tenant.name, 
        createdAt: tenant.createdAt, 
        settings: tenant.settings, 
        features: plainFeatures(tenant.features) 
      },
      featureState,
      currentUser: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.memberships?.find(m => 
          String(m.tenant) === String(tenant._id)
        )?.role || 'employee' 
      },
      owner: owner ? { 
        name: owner.name, 
        email: owner.email 
      } : null,
      team: combinedTeam // שליחת כל הצוות - פעילים + ממתינים
    });

  } catch (e) { 
    console.error('tenant/info error:', e); 
    res.status(500).json({ 
      ok: false, 
      message: 'שגיאה בטעינת נתוני העסק' 
    }); 
  }
});

router.get("/admin/tenants", requireTeamAccess, async (req, res) => {
  try {
    const Tenant = require("../models/Tenant");
    const User = require("../models/user");
    const Invoice = require("../models/Invoice");
    const Dispersion = require("../models/Dispersion");
    const Supplier = require("../models/Supplier");
    const Order = require("../models/Order");
    const ActivityLog = require("../models/ActivityLog");

    const tenants = await Tenant.find({})
      .select("name createdAt owner settings features")
      .populate({ path: "owner", select: "name email" })
      .lean();

    const enrichedTenants = await Promise.all(
      tenants.map(async (t) => {
        const tenantId = t._id;

        // ספירת עובדים
        const teamCount = await User.countDocuments({
          "memberships.tenant": tenantId
        });

        // פירוט עובדים לפי תפקיד
        const teamMembers = await User.find({
          "memberships.tenant": tenantId
        }).select("name email memberships").lean();

        const roleBreakdown = {
          owners: 0,
          managers: 0,
          shift_managers: 0,
          employees: 0
        };

        teamMembers.forEach(member => {
          const membership = member.memberships?.find(
            m => String(m.tenant) === String(tenantId)
          );
          if (membership) {
            const role = membership.role;
            if (role === 'owner') roleBreakdown.owners++;
            else if (role === 'manager') roleBreakdown.managers++;
            else if (role === 'shift_manager') roleBreakdown.shift_managers++;
            else roleBreakdown.employees++;
          }
        });

        // חשבוניות
        const invoiceCount = await Invoice.countDocuments({ tenant: tenantId });
        const invoiceStats = await Invoice.aggregate([
          { $match: { tenant: tenantId } },
          {
            $group: {
              _id: null,
              total: { $sum: "$total" },
              avgTotal: { $avg: "$total" }
            }
          }
        ]);

        // חשבוניות ב-30 הימים האחרונים
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentInvoices = await Invoice.countDocuments({
          tenant: tenantId,
          createdAt: { $gte: thirtyDaysAgo }
        });

        // פיזורים
        const dispersionCount = await Dispersion.countDocuments({ tenant: tenantId });
        const recentDispersions = await Dispersion.countDocuments({
          tenant: tenantId,
          createdAt: { $gte: thirtyDaysAgo }
        });

        // ספקים
        const supplierCount = await Supplier.countDocuments({
          tenant: tenantId,
          isActive: true
        });

        // הזמנות
        const orderCount = await Order.countDocuments({ tenant: tenantId });
        const orderStats = await Order.aggregate([
          { $match: { tenant: tenantId } },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 }
            }
          }
        ]);

        const orderBreakdown = {
          ordered: 0,
          received: 0,
          cancelled: 0,
          draft: 0
        };
        orderStats.forEach(stat => {
          orderBreakdown[stat._id] = stat.count;
        });

        // פעילות אחרונה
        const lastActivity = await ActivityLog.findOne({ tenant: tenantId })
          .sort({ createdAt: -1 })
          .select("createdAt action")
          .lean();

        // תאריך החשבונית האחרונה
        const lastInvoice = await Invoice.findOne({ tenant: tenantId })
          .sort({ createdAt: -1 })
          .select("createdAt invoiceNumber")
          .lean();

        return {
          id: String(t._id),
          name: t.name,
          createdAt: t.createdAt,
          owner: t.owner ? { name: t.owner.name, email: t.owner.email } : null,
          settings: t.settings || {},
          features: t.features || {},
          
          // סטטיסטיקות
          stats: {
            team: {
              total: teamCount,
              breakdown: roleBreakdown
            },
            invoices: {
              total: invoiceCount,
              recent: recentInvoices,
              totalAmount: invoiceStats[0]?.total || 0,
              avgAmount: invoiceStats[0]?.avgTotal || 0,
              lastInvoice: lastInvoice ? {
                date: lastInvoice.createdAt,
                number: lastInvoice.invoiceNumber
              } : null
            },
            dispersions: {
              total: dispersionCount,
              recent: recentDispersions
            },
            suppliers: {
              total: supplierCount
            },
            orders: {
              total: orderCount,
              breakdown: orderBreakdown
            },
            activity: {
              lastAction: lastActivity ? {
                date: lastActivity.createdAt,
                action: lastActivity.action
              } : null
            }
          }
        };
      })
    );

    res.json({ ok: true, tenants: enrichedTenants });
  } catch (error) {
    console.error("Error in /admin/tenants:", error);
    res.status(500).json({ ok: false, message: "שגיאה בטעינת נתונים" });
  }
});

router.put("/tenant/update", authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const { name, settings } = req.body || {};
    const membership = user.memberships?.find(m => String(m.tenant) === String(user.TenantID));
    if (!membership || !['owner','admin'].includes(membership.role))
      return res.status(403).json({ ok:false, message:"אין הרשאה לעדכן פרטי העסק" });
    const tenant = await Tenant.findById(user.TenantID);
    if (!tenant) return res.status(404).json({ ok:false, message:"עסק לא נמצא" });
    if (name) tenant.name = String(name).trim();
    if (settings) tenant.settings = { ...tenant.settings, ...settings };
    await tenant.save();
    res.json({ ok:true, message:"העסק עודכן בהצלחה", tenant:{ id:tenant._id, name:tenant.name, settings:tenant.settings }});
  } catch (err) { console.error("tenant/update error:", err); res.status(500).json({ ok:false, message:"שגיאה בעדכון העסק" }); }
});

module.exports = router;