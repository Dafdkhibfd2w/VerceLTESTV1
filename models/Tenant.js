const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  settings: {
    currency: { type: String, default: 'ILS' },
    language: { type: String, default: 'he' },
    logo: String,
    address: String,
    phone: String
  },

  // ✅ גמיש לעתיד: כל מפתח ב-features הוא בוליאני
  features: {
    type: Map,
    of: Boolean,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model('Tenant', TenantSchema);
