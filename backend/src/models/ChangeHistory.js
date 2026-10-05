const { Schema, model, models } = require("mongoose");

// A generic, append-only audit trail: one row per field that actually
// changed on a Person or Grampanchayat. Written automatically by the
// controllers whenever an update is saved (whether applied directly by an
// admin, or applied because an admin approved an employee's change
// request) - never entered by hand, so it can't drift from what really
// happened.
const ChangeHistorySchema = new Schema(
  {
    entityType: { type: String, enum: ["Person", "GramPanchayat"], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true, refPath: "entityType" },
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    source: { type: String, enum: ["direct", "approved_request", "approved_edited_request", "merge"], default: "direct" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ChangeHistorySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = models.ChangeHistory || model("ChangeHistory", ChangeHistorySchema);
