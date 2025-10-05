// models/ActivityLog.js
const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  tenant:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  actor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  actorName:  String,
  actorEmail: String,

  action:     { type: String, required: true }, // "member:create", "member:update", "tenant:update", ...
  target: {
    kind:  String,  // "User" / "Tenant" / "Invoice" ...
    id:    String,  // מזהה יעד (לא חובה ObjectId)
    label: String,  // שם לקריאה נוחה
    email: String   // אם רלוונטי
  },

  meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // פרטים קטנים חופשיים
  ip:   String,
  ua:   String
}, { timestamps: { createdAt: true, updatedAt: false } });

ActivityLogSchema.index({ tenant: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
