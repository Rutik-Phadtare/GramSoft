const { Schema, model, models } = require("mongoose");

const NotificationSchema = new Schema(
  {
    type: { type: String, required: true, trim: true },
    // Navigation section this notification belongs to. Keeping this explicit
    // lets the sidebar show accurate per-section unread badges without
    // running separate queries for Feedback, Registrations, Approvals, etc.
    section: { type: String, required: true, trim: true, default: "dashboard" },
    title: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    link: { type: String, trim: true },
    sourceId: { type: Schema.Types.ObjectId },
    // Recipient-aware notifications prevent one admin reading a notification
    // from accidentally marking it as read for every other admin.
    // `null` remains valid for legacy rows created before recipient support.
    recipient: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, section: 1, readAt: 1 });

module.exports = models.Notification || model("Notification", NotificationSchema);
