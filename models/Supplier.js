// models/Supplier.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const SupplierSchema = new Schema({
  tenant: { 
    type: Schema.Types.ObjectId, 
    ref: 'Tenant', 
    required: true, 
    index: true 
  },
  
  name: { 
    type: String, 
    required: true, 
    trim: true,
    index: true 
  },
  
  phone: { 
    type: String, 
    required: true, 
    trim: true 
  },
  
  // ימי הגעה - מאסף של ימים (0=ראשון, 1=שני, ..., 5=שישי)
  deliveryDays: [{
    type: Number,
    min: 0,
    max: 5
  }],
  
  // רשימת מוצרים שהספק מספק
  products: [{
    name: { type: String, required: true, trim: true },
    unit: { type: String, trim: true }, // יחידת מידה (ק"ג, ליטר, יחידה וכו')
    lastPrice: { type: Number }, // מחיר אחרון (אופציונלי)
    notes: { type: String, trim: true }
  }],
  
  // הערות כלליות על הספק
  notes: { 
    type: String, 
    trim: true 
  },
  
  // האם הספק פעיל
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  createdBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }
  
}, { 
  timestamps: true 
});

// אינדקס ייחודי - שם הספק חייב להיות ייחודי בתוך כל טננט
SupplierSchema.index(
  { tenant: 1, name: 1 },
  { unique: true }
);

module.exports = mongoose.models.Supplier || mongoose.model('Supplier', SupplierSchema);