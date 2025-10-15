// models/Order.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrderItemSchema = new Schema({
  productName: { 
    type: String, 
    required: true,
    trim: true 
  },
  quantity: { 
    type: Number, 
    required: true,
    min: 0 
  },
  unit: { 
    type: String, 
    trim: true 
  },
  notes: { 
    type: String, 
    trim: true 
  }
}, { _id: false });

const OrderSchema = new Schema({
  tenant: { 
    type: Schema.Types.ObjectId, 
    ref: 'Tenant', 
    required: true, 
    index: true 
  },
  
  // תאריך ההזמנה
  orderDate: { 
    type: Date, 
    required: true,
    index: true 
  },
  
  // יום בשבוע (0-5)
  dayOfWeek: { 
    type: Number, 
    required: true,
    min: 0,
    max: 5 
  },
  
  // הספק
  supplier: { 
    type: Schema.Types.ObjectId, 
    ref: 'Supplier', 
    required: true,
    index: true 
  },
  
  // שם הספק (למקרה שהספק יימחק)
  supplierName: { 
    type: String, 
    required: true 
  },
  
  // המוצרים שהוזמנו
  items: [OrderItemSchema],
  
  // סה"כ פריטים
  totalItems: { 
    type: Number, 
    default: 0 
  },
  
  // סטטוס ההזמנה
  status: { 
    type: String, 
    enum: ['draft', 'ordered', 'received', 'cancelled'],
    default: 'ordered',
    index: true 
  },
  
  // הערות כלליות
  notes: { 
    type: String, 
    trim: true 
  },
  
  // מי יצר את ההזמנה
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  
  createdByName: { 
    type: String, 
    required: true 
  },
  
  // תאריך קבלה (אם התקבל)
  receivedDate: Date,
  
  receivedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }
  
}, { 
  timestamps: true 
});

// אינדקס מורכב - מונע הזמנות כפולות לאותו ספק באותו תאריך
OrderSchema.index(
  { tenant: 1, supplier: 1, orderDate: 1 },
  { unique: true }
);

// חישוב אוטומטי של totalItems לפני שמירה
OrderSchema.pre('save', function(next) {
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
  next();
});

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
