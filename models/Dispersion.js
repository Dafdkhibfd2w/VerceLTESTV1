// models/Dispersion.js
const mongoose = require('mongoose');

const DispersionSchema = new mongoose.Schema({
  tenant:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
  date:     { type: Date, required: true, index: true },
  payer:    { type: String, default: '', index: true },  // מי שילם
  taxi:     { type: String, default: '', index: true },  // נהג/חברה
  price:    { type: Number, default: 0 },                // מחיר בש״ח
  createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

DispersionSchema.index({ tenant: 1, date: -1, createdAt: -1 });
DispersionSchema.index({ tenant: 1, payer: 1 });
DispersionSchema.index({ tenant: 1, taxi: 1 });

module.exports = mongoose.model('Dispersion', DispersionSchema);
