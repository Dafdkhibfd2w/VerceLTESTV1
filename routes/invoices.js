const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const XLSX = require("xlsx");
const { authenticateUser } = require("../middlewares/auth");
const { requireTenantFeature } = require("../middlewares/features");
const Invoice = require("../models/Invoice");
const Counter = require("../models/Counter");
const { log } = require("../utils/logger");

const router = express.Router();

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

// Upload
router.post('/invoices/upload', authenticateUser, requireTenantFeature('invoices'), upload.single('file'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    if (!tenantId) return res.status(400).json({ ok:false, message:'חסרה זיקה לעסק' });
    if (!req.file)  return res.status(400).json({ ok:false, message:'לא נבחר קובץ' });
    const description = String(req.body?.description || "").trim();
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
    res.json({ ok:true, id: inv._id, url: inv.file?.url, originalname: inv.originalname, username: inv.uploadedByN, mimetype: inv.mimetype, size: inv.size, description: inv.description, uploadedAt: inv.createdAt });
  } catch (e) { console.error('upload invoice error:', e); res.status(500).json({ ok:false, message: e.message || 'שגיאה בהעלאה' }); }
});

// Delete
router.delete('/invoices/:id', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const { id } = req.params;
    const inv = await Invoice.findById(id);
    if (!inv) return res.status(404).json({ ok:false, message:'חשבונית לא נמצאה' });
    if (String(inv.tenant) !== String(tenantId)) return res.status(403).json({ ok:false, message:'אין לך גישה לחשבונית זו' });

    const { getRoleForTenant } = require("../middlewares/auth");
    const myRole = getRoleForTenant(req.user, tenantId);
    const isUploader = String(inv.uploadedBy) === String(req.user._id);
    if (!['owner','manager','shift_manager'].includes(myRole) && !isUploader) return res.status(403).json({ ok:false, message:'אין לך הרשאה למחוק חשבונית זו' });

    try {
      if (inv.file?.public_id) {
        const rtype = inv.file?.resource_type || (String(inv.mimetype||'').includes('pdf') ? 'raw' : 'image');
        await cloudinary.uploader.destroy(inv.file.public_id, { resource_type: rtype });
      }
    } catch (e) { console.warn('cloudinary destroy failed:', e.message); }

    await log(req, 'invoice:delete', { kind:'Invoice', id:String(inv._id), label: inv.description || inv.originalname, url: inv.file?.url }, { size: inv.size, mimetype: inv.mimetype });
    await Invoice.deleteOne({ _id: inv._id });
    res.json({ ok:true });
  } catch (e) { console.error('delete invoice error:', e); res.status(500).json({ ok:false, message:'שגיאה במחיקה' }); }
});

// Search/list
router.get('/invoices/search', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const q = String(req.query.q || '').trim();
    const cond = { tenant: tenantId };
    if (q) cond.description = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const items = await Invoice.find(cond).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ ok:true, items });
  } catch (e) { console.error(e); res.status(500).json({ ok:false, message: 'שגיאה בחיפוש' }); }
});

router.get('/invoices/list', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const items = await Invoice.find({ tenant: tenantId }).sort({ createdAt: -1 }).select('number description uploadedByN createdAt file.url').lean();
    res.json({ ok:true, invoices: items.map(x => ({ id:String(x._id), number:x.number ?? null, description:x.description || '', uploader:x.uploadedByN || '', at:x.createdAt, url:x.file?.url || null }))});
  } catch (e) { console.error('invoices/list error:', e); res.status(500).json({ ok:false, message:'שגיאה בטעינת חשבוניות' }); }
});

// Export XLSX
// Export XLSX
// Export XLSX
router.get('/invoices/export', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const month = String(req.query.month || '').trim();
    if (!tenantId || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ ok:false, message:'חודש לא נבחר/לא תקין (YYYY-MM)' });
    }

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end   = new Date(year, mon, 1);
    const range = { $gte: start, $lt: end };

    // 👇 מסנן על createdAt או uploadedAt (ולמי ששמר זמן בתוך file)
    const invoices = await Invoice.find({
      tenant: tenantId,
      $or: [
        { createdAt: range },
        { uploadedAt: range },
        { 'file.created_at': range } // אם קיימים נתונים היסטוריים
      ]
    }).lean();
console.log('export month', { month, start, end, found: invoices.length, sample: invoices[0]?._id });

    if (!invoices.length) {
      return res.status(404).json({ ok:false, message:'אין חשבוניות בחודש זה' });
    }

    const rows = invoices.map(inv => ({
      מספר: inv.number,
      תיאור: inv.description || '',
      העלה: inv.uploadedByN,
      תאריך: new Date(inv.createdAt || inv.uploadedAt).toLocaleDateString('he-IL'),
      גודל: `${((inv.size || inv.file?.bytes || 0)/1024).toFixed(1)} KB`,
      קובץ: inv.file?.url || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    invoices.forEach((inv, i) => {
      const url = inv.file?.url;
      if (url) {
        const cell = XLSX.utils.encode_cell({ r: i + 1, c: 5 });
        ws[cell] = { t:'s', v:'פתח קובץ', l:{ Target: url, Tooltip:'לחץ לפתיחת הקובץ' } };
      }
    });

    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'חשבוניות');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename=invoices-${month}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    console.error('export invoices error:', e);
    res.status(500).json({ ok:false, message:'שגיאת שרת ביצוא החשבוניות' });
  }
});


// routes/invoices.js
const axios = require('axios');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// עוזרים
const safe = s => String(s || '').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
const fmtDate = d => {
  const dt = new Date(d); if (isNaN(dt)) return '';
  return dt.toLocaleDateString('he-IL');
};

router.get('/invoices/export-pdf', authenticateUser, requireTenantFeature('invoices'), async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const m = String(req.query.month || '').trim().match(/^(\d{4})-(\d{2})$/);
    if (!tenantId || !m) return res.status(400).json({ ok:false, message:'חודש לא תקין (YYYY-MM)' });
    const year = +m[1], mon = +m[2];
    if (year < 2000 || year > 2100 || mon < 1 || mon > 12)
      return res.status(400).json({ ok:false, message:'חודש מחוץ לטווח' });

    const start = new Date(year, mon - 1, 1);
    const end   = new Date(year, mon, 1);
    const range = { $gte: start, $lt: end };

    // כמו שתיקנו קודם – תמיכה בכמה שדות תאריך
    const invoices = await Invoice.find({
      tenant: tenantId,
      $or: [
        { createdAt: range },
        { uploadedAt: range },
        { 'file.created_at': range }
      ]
    }).sort({ createdAt: 1 }).lean();

    if (!invoices.length) return res.status(404).json({ ok:false, message:'אין חשבוניות בחודש זה' });

    // PDF יעד
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const headerColor = rgb(0.12, 0.12, 0.12);

    // עמוד A4 לעבודה עם תמונות
    const A4 = { w: 595.28, h: 841.89 };

    // נביא קובץ-קובץ מה-URL בענן
    const fetchBytes = async (url) => {
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      return Buffer.from(r.data);
    };

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      const url = inv.file?.url;
      if (!url) continue;

      const desc = safe(inv.description || '');
      const num  = inv.number ?? (i + 1);
      const dateS = fmtDate(inv.createdAt || inv.uploadedAt);
      const header = `#${num} · ${dateS}${desc ? ' · ' + desc : ''}`;

      // מזהים סוג
      const mt = String(inv.mimetype || '').toLowerCase();
      const isPdf = mt.includes('pdf') || /\.pdf($|\?)/i.test(url);

      const bytes = await fetchBytes(url);

      if (isPdf) {
        // ממזגים PDF קיים
        const src = await PDFDocument.load(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => {
          out.addPage(p);
          // כותרת דקה למעלה
          const { width, height } = p.getSize();
          p.drawText(header, { x: 24, y: height - 28, size: 10, font, color: headerColor });
        });
      } else {
        // תמונה → עמוד A4 עם התאמה לגודל
        const page = out.addPage([A4.w, A4.h]);
        let img, w, h;
        if (mt.includes('png')) {
          img = await out.embedPng(bytes); w = img.width; h = img.height;
        } else {
          img = await out.embedJpg(bytes); w = img.width; h = img.height;
        }
        // התאמה לעמוד עם שוליים
        const margin = 36;
        const maxW = A4.w - margin * 2;
        const maxH = A4.h - margin * 2 - 18; // מקום לכותרת
        const ratio = Math.min(maxW / w, maxH / h);
        const dw = w * ratio, dh = h * ratio;
        const dx = (A4.w - dw) / 2;
        const dy = (A4.h - dh) / 2 - 10;

        page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
        page.drawText(header, { x: margin, y: A4.h - margin + 2, size: 10, font, color: headerColor });
      }
    }

    const pdfBytes = await out.save();
    res.setHeader('Content-Disposition', `attachment; filename=invoices-${m[1]}-${m[2]}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('export-pdf error', e);
    return res.status(500).json({ ok:false, message:'שגיאה ביצוא PDF מאוחד' });
  }
});


module.exports = router;
