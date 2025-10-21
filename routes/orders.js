// routes/orders.js
const express = require('express');
const router = express.Router();
const { authenticateUser, requireRoles } = require('../middlewares/auth');
const Order = require('../models/Order');
const Supplier = require('../models/Supplier');

// Middleware - רק מנהלים יכולים לנהל הזמנות
const requireManager = requireRoles(['owner', 'manager', 'shift_manager']);

// ========================================
// GET /api/orders/suppliers-by-date?date=YYYY-MM-DD
// קבלת ספקים לפי תאריך
// ========================================
router.get('/orders/suppliers-by-date', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ ok: false, message: 'חובה לספק תאריך' });
    }
    
    // חישוב יום בשבוע (0=ראשון, 6=שבת)
    const selectedDate = new Date(date);
    let dayOfWeek = selectedDate.getDay();
    
    // המרה: במערכת שלנו 0=ראשון, 5=שישי (בלי שבת)
    if (dayOfWeek === 6) {
      return res.json({ 
        ok: true, 
        suppliers: [],
        message: 'אין משלוחים בשבת' 
      });
    }
    
    // קבלת ספקים שמגיעים ביום זה
    const suppliers = await Supplier.find({
      tenant: tenantId,
      deliveryDays: dayOfWeek,
      isActive: true
    })
      .sort({ name: 1 })
      .lean();
    
    res.json({ ok: true, suppliers, dayOfWeek });
    
  } catch (error) {
    console.error('Error fetching suppliers by date:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת ספקים' });
  }
});

// ========================================
// GET /api/orders?date=YYYY-MM-DD
// קבלת הזמנות לתאריך ספציפי
// ========================================
router.get('/orders', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const { date, status } = req.query;
    
    const query = { tenant: tenantId };
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      query.orderDate = { $gte: startDate, $lte: endDate };
    }
    
    if (status) {
      query.status = status;
    }
    
    const orders = await Order.find(query)
      .populate('supplier', 'name phone')
      .sort({ orderDate: -1, supplierName: 1 })
      .lean();
    
    res.json({ ok: true, orders });
    
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת הזמנות' });
  }
});

// ========================================
// GET /api/orders/:id
// קבלת הזמנה בודדת
// ========================================
router.get('/orders/:id', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const orderId = req.params.id;
    
    const order = await Order.findOne({ 
      _id: orderId, 
      tenant: tenantId 
    })
      .populate('supplier', 'name phone')
      .lean();
    
    if (!order) {
      return res.status(404).json({ ok: false, message: 'הזמנה לא נמצאה' });
    }
    
    res.json({ ok: true, order });
    
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת הזמנה' });
  }
});

// ========================================
// POST /api/orders
// יצירת הזמנות חדשות (batch)
// ========================================
router.post('/orders', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const userId = req.user._id;
    const userName = req.user.username || req.user.name || 'משתמש';
    
    const { date, orders } = req.body;
    
    // וולידציה
    if (!date || !orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ 
        ok: false, 
        message: 'חובה לספק תאריך ולפחות הזמנה אחת' 
      });
    }
    
    const orderDate = new Date(date);
    const dayOfWeek = orderDate.getDay();
    
    const createdOrders = [];
    const errors = [];
    
    // יצירת הזמנה לכל ספק
    for (const orderData of orders) {
      try {
        const { supplierId, supplierName, items, notes } = orderData;
        
        // סינון פריטים עם כמות > 0
        const validItems = items.filter(item => item.quantity > 0);
        
        if (validItems.length === 0) {
          continue; // דלג על הזמנות ריקות
        }
        
        // בדיקה אם כבר קיימת הזמנה
        const existingOrder = await Order.findOne({
          tenant: tenantId,
          supplier: supplierId,
          orderDate: {
            $gte: new Date(orderDate.setHours(0, 0, 0, 0)),
            $lte: new Date(orderDate.setHours(23, 59, 59, 999))
          }
        });
        
        if (existingOrder) {
          // עדכן הזמנה קיימת
          existingOrder.items = validItems;
          existingOrder.notes = notes;
          existingOrder.status = 'ordered';
          await existingOrder.save();
          createdOrders.push(existingOrder);
        } else {
          // צור הזמנה חדשה
          const order = new Order({
            tenant: tenantId,
            orderDate: new Date(date),
            dayOfWeek,
            supplier: supplierId,
            supplierName,
            items: validItems,
            notes,
            createdBy: userId,
            createdByName: userName,
            status: 'ordered'
          });
          
          await order.save();
          createdOrders.push(order);
        }
        
      } catch (error) {
        console.error('Error creating order for supplier:', orderData.supplierId, error);
        errors.push({
          supplier: orderData.supplierName,
          error: error.message
        });
      }
    }
    
    if (createdOrders.length === 0 && errors.length > 0) {
      return res.status(400).json({ 
        ok: false, 
        message: 'שגיאה ביצירת הזמנות',
        errors 
      });
    }
    
    res.status(201).json({ 
      ok: true, 
      message: `${createdOrders.length} הזמנות נשמרו בהצלחה`,
      orders: createdOrders,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error creating orders:', error);
    res.status(500).json({ ok: false, message: 'שגיאה ביצירת הזמנות' });
  }
});

// ========================================
// PUT /api/orders/:id
// עדכון הזמנה
// ========================================
router.put('/orders/:id', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const orderId = req.params.id;
    const { items, status, notes, receivedDate } = req.body;
    
    const order = await Order.findOne({ 
      _id: orderId, 
      tenant: tenantId 
    });
    
    if (!order) {
      return res.status(404).json({ ok: false, message: 'הזמנה לא נמצאה' });
    }
    
    // עדכון שדות
    if (items !== undefined) order.items = items;
    if (status !== undefined) order.status = status;
    if (notes !== undefined) order.notes = notes;
    if (receivedDate !== undefined) {
      order.receivedDate = receivedDate;
      if (receivedDate) {
        order.receivedBy = req.user._id;
      }
    }
    
    await order.save();
    
    res.json({ 
      ok: true, 
      message: 'ההזמנה עודכנה בהצלחה', 
      order 
    });
    
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בעדכון הזמנה' });
  }
});

// ========================================
// DELETE /api/orders/:id
// מחיקת הזמנה
// ========================================
router.delete('/orders/:id', authenticateUser, requireManager, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    const orderId = req.params.id;
    
    const order = await Order.findOneAndDelete({ 
      _id: orderId, 
      tenant: tenantId 
    });
    
    if (!order) {
      return res.status(404).json({ ok: false, message: 'הזמנה לא נמצאה' });
    }
    
    res.json({ 
      ok: true, 
      message: 'ההזמנה נמחקה בהצלחה' 
    });
    
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ ok: false, message: 'שגיאה במחיקת הזמנה' });
  }
});

// ========================================
// GET /api/orders/stats/summary
// סטטיסטיקות הזמנות
// ========================================
router.get('/orders/stats/summary', authenticateUser, async (req, res) => {
  try {
    const tenantId = req.user.TenantID;
    
    const stats = await Order.aggregate([
      { $match: { tenant: tenantId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalItems: { $sum: '$totalItems' }
        }
      }
    ]);
    
    res.json({ ok: true, stats });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ ok: false, message: 'שגיאה בטעינת סטטיסטיקות' });
  }
});

module.exports = router;
