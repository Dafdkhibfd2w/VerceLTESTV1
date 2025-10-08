const mongoose = require('mongoose');

const InviteSchema = new mongoose.Schema({
  tenant:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  email:      { type: String, required: true, lowercase: true, trim: true, index: true },
  role:       { type: String, enum: ['employee','shift_manager','manager', 'owner'], default: 'employee' },
  token:      { type: String, required: true, unique: true, index: true },
  expiresAt:  { type: Date,   required: true, index: { expires: '0s' } }, // TTL ע״פ שדה
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Invite', InviteSchema);
