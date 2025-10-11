// routes/dispersions.js
const express = require('express');
const router = express.Router();
const Dispersion = require('../models/Dispersion');
const { authenticateUser, getRoleForTenant } = require('../middlewares/auth');
const { requireTenantFeature } = require('../middlewares/features');

function requireWriteRole(req, res, next) {
  const role = getRoleForTenant(req.user, req.user.TenantID);
  if (!['owner','manager','shift_manager'].includes(role)) {
    return res.status(403).json({ ok:false, message:'אין לך הרשאה לפעולה זו' });
  }
  next();
}

function parseDateInput(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// רשימה
router.get('/dispersions/list',
  authenticateUser, requireTenantFeature('dispersions'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const rows = await Dispersion.find({ tenant: tenantId })
        .sort({ date: -1, createdAt: -1 })
        .limit(200)
        .lean();

      res.json({
        ok: true,
        dispersions: rows.map(x => ({
          id: String(x._id),
          date: x.date,
          payer: x.payer || '',
          taxi: x.taxi || '',
          price: Number(x.price || 0)
        }))
      });
    } catch (e) {
      console.error('dispersions/list error:', e);
      res.status(500).json({ ok:false, message:'שגיאה בטעינת פיזורים' });
    }
  }
);

// חיפוש לפי payer/taxi
router.get('/dispersions/search',
  authenticateUser, requireTenantFeature('dispersions'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const q = String(req.query.q || '').trim();
      const cond = { tenant: tenantId };
      if (q) {
        const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
        cond.$or = [{ payer: rx }, { taxi: rx }];
      }
      const rows = await Dispersion.find(cond).sort({ date: -1, createdAt: -1 }).limit(200).lean();
      res.json({
        ok: true,
        items: rows.map(x => ({
          id: String(x._id),
          date: x.date,
          payer: x.payer || '',
          taxi: x.taxi || '',
          price: Number(x.price || 0)
        }))
      });
    } catch (e) {
      console.error('dispersions/search error:', e);
      res.status(500).json({ ok:false, message:'שגיאה בחיפוש פיזורים' });
    }
  }
);

// יצירה
router.post('/dispersions',
  authenticateUser, requireTenantFeature('dispersions'), requireWriteRole,
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const date = parseDateInput(req.body?.date);
      const payer = String(req.body?.payer || '').trim();
      const taxi  = String(req.body?.taxi  || '').trim();
      const price = Number(req.body?.price ?? 0);

      if (!date) return res.status(400).json({ ok:false, message:'חובה לבחור תאריך' });
      if (!payer) return res.status(400).json({ ok:false, message:'יש להזין מי שילם' });
      if (!taxi)  return res.status(400).json({ ok:false, message:'יש להזין שם מונית/נהג' });
      if (isNaN(price) || price < 0) return res.status(400).json({ ok:false, message:'מחיר לא תקין' });

      const doc = await Dispersion.create({
        tenant: tenantId, date, payer, taxi, price, createdBy: req.user._id
      });

      res.json({ ok:true, id: String(doc._id) });
    } catch (e) {
      console.error('dispersions create error:', e);
      res.status(500).json({ ok:false, message:'שגיאה ביצירת פיזור' });
    }
  }
);

// עדכון
router.put('/dispersions/:id',
  authenticateUser, requireTenantFeature('dispersions'), requireWriteRole,
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const { id } = req.params;

      const doc = await Dispersion.findOne({ _id: id, tenant: tenantId });
      if (!doc) return res.status(404).json({ ok:false, message:'פיזור לא נמצא' });

      if (req.body?.date !== undefined) {
        const d = parseDateInput(req.body.date);
        if (!d) return res.status(400).json({ ok:false, message:'תאריך לא תקין' });
        doc.date = d;
      }
      if (req.body?.payer !== undefined) doc.payer = String(req.body.payer || '').trim();
      if (req.body?.taxi  !== undefined) doc.taxi  = String(req.body.taxi  || '').trim();
      if (req.body?.price !== undefined) {
        const p = Number(req.body.price);
        if (isNaN(p) || p < 0) return res.status(400).json({ ok:false, message:'מחיר לא תקין' });
        doc.price = p;
      }

      await doc.save();
      res.json({ ok:true });
    } catch (e) {
      console.error('dispersions update error:', e);
      res.status(500).json({ ok:false, message:'שגיאה בעדכון פיזור' });
    }
  }
);

// מחיקה
router.delete('/dispersions/:id',
  authenticateUser, requireTenantFeature('dispersions'), requireWriteRole,
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const { id } = req.params;

      const doc = await Dispersion.findOne({ _id: id, tenant: tenantId });
      if (!doc) return res.status(404).json({ ok:false, message:'פיזור לא נמצא' });

      await Dispersion.deleteOne({ _id: doc._id });
      res.json({ ok:true });
    } catch (e) {
      console.error('dispersions delete error:', e);
      res.status(500).json({ ok:false, message:'שגיאה במחיקת פיזור' });
    }
  }
);
const XLSX   = require('xlsx');
const PDFKit = require('pdfkit');

// GET /api/dispersions/export?month=YYYY-MM&type=xlsx|pdf
router.get('/dispersions/export',
  authenticateUser, requireTenantFeature('dispersions'),
  async (req, res) => {
    try {
      const tenantId = req.user.TenantID;
      const month = String(req.query.month || '').trim();
      const type  = (String(req.query.type || 'xlsx').toLowerCase() === 'pdf') ? 'pdf' : 'xlsx';
      if (!tenantId || !/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ ok:false, message:'חודש לא נבחר/לא תקין (YYYY-MM)' });
      }

      const [year, mon] = month.split('-').map(Number);
      const start = new Date(year, mon - 1, 1);
      const end   = new Date(year, mon, 1);

      const rows = await Dispersion.find({
        tenant: tenantId,
        date: { $gte: start, $lt: end }
      }).sort({ date: 1 }).lean();

      if (!rows.length) {
        return res.status(404).json({ ok:false, message:'אין פיזורים בחודש זה' });
      }

      const items = rows.map(x => ({
        תאריך:  new Date(x.date).toLocaleDateString('he-IL'),
        'מי שילם': x.payer || '',
        מונית:   x.taxi  || '',
        מחיר:    Number(x.price || 0)
      }));
      const total = items.reduce((s, r) => s + (r.מחיר || 0), 0);

      if (type === 'xlsx') {
        // === Excel ===
        const printable = items.map(r => ({ ...r, מחיר: r.מחיר })); // מספר נטו
        const ws = XLSX.utils.json_to_sheet(printable);
        // שורת סכום
        XLSX.utils.sheet_add_aoa(ws, [['', '', 'סה״כ', total]], { origin: -1 });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'פיזורים');
        const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename=dispersions-${month}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.send(buf);
      }

      // === PDF ===
      res.setHeader('Content-Disposition', `attachment; filename=dispersions-${month}.pdf`);
      res.setHeader('Content-Type', 'application/pdf');

      const doc = new PDFKit({ size: 'A4', margin: 36, layout: 'portrait' });
      doc.pipe(res);

      // כותרת
      doc.fontSize(18).text(`דו״ח פיזורים - ${month}`, { align: 'right' });
      doc.moveDown(0.5);

      // כותרת טבלה
      doc.fontSize(12);
      const colX = [540, 420, 280, 120]; // ימינה ← שמאלה (RTL)
      const headers = ['תאריך', 'מי שילם', 'מונית', 'מחיר'];
      headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: 110, align: 'right' }));
      doc.moveDown(0.3);
      doc.moveTo(36, doc.y).lineTo(559, doc.y).stroke();

      // שורות
      doc.moveDown(0.3);
      items.forEach(r => {
        const vals = [r.תאריך, r['מי שילם'], r.מונית, r.מחיר.toLocaleString('he-IL', { style:'currency', currency:'ILS' })];
        vals.forEach((v, i) => doc.text(String(v), colX[i], doc.y, { width: 110, align: 'right' }));
        doc.moveDown(0.2);
      });

      // קו וסיכום
      doc.moveDown(0.3);
      doc.moveTo(36, doc.y).lineTo(559, doc.y).stroke();
      doc.moveDown(0.4);
      doc.fontSize(13).text(
        `סה״כ: ${total.toLocaleString('he-IL', { style:'currency', currency:'ILS' })}`,
        { align: 'right' }
      );

      doc.end();
    } catch (e) {
      console.error('dispersions export error:', e);
      res.status(500).json({ ok:false, message:'שגיאת שרת ביצוא פיזורים' });
    }
  }
);

module.exports = router;
