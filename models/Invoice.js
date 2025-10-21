// models/Invoice.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const InvoiceSchema = new Schema({
  tenant:      { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  number:      { type: Number, required: true, index: true }, // ✅ חדש
  uploadedBy:  { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  uploadedByN:  { type: String, required: true, index: true },

  description: { type: String, trim: true, index: true },

  originalname: String,
  mimetype:     String,
  size:         Number,

  file: {
    public_id:        String,
    url:              String,
    format:           String,
    resource_type:    String,
    bytes:            Number,
    width:            Number,
    height:           Number,
    original_filename:String
  }
}, { timestamps: true });

// ייחודיות לכל טננט רק כשיש number מספרי (מונע התנגשויות על null)
InvoiceSchema.index(
  { tenant: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'number' } } }
);

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
