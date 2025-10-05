const mongoose = require('mongoose');

const MembershipSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
  role:   { type: String, enum: ['owner','manager','shift_manager','employee'], default: 'employee' }
}, { _id: false });


const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, sparse: true },
  name: String,
  email: { type: String, index: true, unique: true },
  passwordHash: String,
  memberships: [MembershipSchema],
  TenantName: String,
  TenantID: mongoose.Schema.Types.ObjectId,
  isPlatformAdmin: { type: Boolean, default: false }
}, { timestamps: true });
module.exports = mongoose.model('User', UserSchema);