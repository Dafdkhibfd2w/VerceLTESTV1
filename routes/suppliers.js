// routes/suppliers.js
const express = require('express');
const router = express.Router();
const { authenticateUser, requireRoles } = require('../middlewares/auth');
const Supplier = require('../models/Supplier');

// Middleware - רק מנהלים ומעלה יכולים לנהל ספקים
const requireManager = requireRoles(['owner', 'manager', 'shift_manager']);

// 📋 GET /api/suppliers - קבלת כל הספקים של הטננט
router.get('/suppliers', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    
    const suppliers = await Supplier.find({ tenant: tenantId })
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, suppliers });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת ספקים' });
  }
});

// 🔍 GET /api/suppliers/:id - קבלת ספק בודד
router.get('/suppliers/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const supplierId = req.params.id;
    
    const supplier = await Supplier.findOne({ 
      _id: supplierId, 
      tenant: tenantId 
    }).lean();
    
    if (!supplier) {
      return res.status(404).json({ ok: false, message: 'ספק לא נמצא' });
    }
    
    res.json({ ok: true, supplier });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת ספק' });
  }
});

// ➕ POST /api/suppliers - הוספת ספק חדש
router.post('/suppliers', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const userId = req.user._id;
    
    const { name, phone, deliveryDays, products, notes } = req.body;
    
    // וולידציה בסיסית
    if (!name || !phone) {
      return res.status(400).json({ 
        ok: false, 
        message: 'שם וטלפון הם שדות חובה' 
      });
    }
    
    // בדיקה שהספק לא קיים כבר
    const existingSupplier = await Supplier.findOne({ 
      tenant: tenantId, 
      name: name.trim() 
    });
    
    if (existingSupplier) {
      return res.status(409).json({ 
        ok: false, 
        message: 'ספק בשם זה כבר קיים במערכת' 
      });
    }
    
    // יצירת ספק חדש
    const supplier = new Supplier({
      tenant: tenantId,
      name: name.trim(),
      phone: phone.trim(),
      deliveryDays: deliveryDays || [],
      products: products || [],
      notes: notes || '',
      createdBy: userId
    });
    
    await supplier.save();
    
    res.status(201).json({ 
      ok: true, 
      message: 'הספק נוסף בהצלחה', 
      supplier 
    });
    
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ ok: false, message: 'שגיאה ביצירת ספק' });
  }
});

// ✏️ PUT /api/suppliers/:id - עדכון ספק
router.put('/suppliers/:id', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const supplierId = req.params.id;
    
    const { name, phone, deliveryDays, products, notes, isActive } = req.body;
    
    // בדיקה שהספק קיים ושייך לטננט
    const supplier = await Supplier.findOne({ 
      _id: supplierId, 
      tenant: tenantId 
    });
    
    if (!supplier) {
      return res.status(404).json({ ok: false, message: 'ספק לא נמצא' });
    }
    
    // בדיקת שם כפול אם השם שונה
    if (name && name.trim() !== supplier.name) {
      const existingSupplier = await Supplier.findOne({ 
        tenant: tenantId, 
        name: name.trim(),
        _id: { $ne: supplierId }
      });
      
      if (existingSupplier) {
        return res.status(409).json({ 
          ok: false, 
          message: 'ספק בשם זה כבר קיים במערכת' 
        });
      }
    }
    
    // עדכון השדות
    if (name !== undefined) supplier.name = name.trim();
    if (phone !== undefined) supplier.phone = phone.trim();
    if (deliveryDays !== undefined) supplier.deliveryDays = deliveryDays;
    if (products !== undefined) supplier.products = products;
    if (notes !== undefined) supplier.notes = notes;
    if (isActive !== undefined) supplier.isActive = isActive;
    
    await supplier.save();
    
    res.json({ 
      ok: true, 
      message: 'הספק עודכן בהצלחה', 
      supplier 
    });
    
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בעדכון ספק' });
  }
});

// 🗑️ DELETE /api/suppliers/:id - מחיקת ספק
router.delete('/suppliers/:id', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const supplierId = req.params.id;
    
    const supplier = await Supplier.findOneAndDelete({ 
      _id: supplierId, 
      tenant: tenantId 
    });
    
    if (!supplier) {
      return res.status(404).json({ ok: false, message: 'ספק לא נמצא' });
    }
    
    res.json({ 
      ok: true, 
      message: 'הספק נמחק בהצלחה' 
    });
    
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ ok: false, message: 'שגיאה במחיקת ספק' });
  }
});

// 📅 GET /api/suppliers/by-day/:day - קבלת ספקים לפי יום (0-5)
router.get('/suppliers/by-day/:day', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const day = parseInt(req.params.day);
    
    if (isNaN(day) || day < 0 || day > 5) {
      return res.status(400).json({ 
        ok: false, 
        message: 'יום לא תקין (חייב להיות בין 0-5)' 
      });
    }
    
    const suppliers = await Supplier.find({ 
      tenant: tenantId,
      deliveryDays: day,
      isActive: true
    })
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, suppliers });
  } catch (error) {
    console.error('Error fetching suppliers by day:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת ספקים' });
  }
});

module.exports = router;