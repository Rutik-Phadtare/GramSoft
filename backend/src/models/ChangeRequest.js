const { Schema, model, models } = require("mongoose");

// An employee-proposed edit, sitting in a queue until an admin approves or
// rejects it - nothing here ever touches the live Person/Grampanchayat
// record until approved. entityId is null for a brand-new-contact
// proposal (there's no existing record yet to point at).
const ChangeRequestSchema = new Schema(
  {
    entityType: { type: String, enum: ["Person", "GramPanchayat", "General"], required: true },
    entityId: { type: Schema.Types.ObjectId, refPath: "entityType", default: null },
    isNewEntity: { type: Boolean, default: false },
    // Only meaningful when entityType === "Person": the Grampanchayat this
    // contact was suggested/confirmed at. On approval of a new-contact
    // request, this is what turns "a person exists" into "a person is
    // actually reachable when someone filters contacts by this GP" - see
    // PersonAssignment and approveChangeRequest.
    gramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat", default: null },
    proposedChanges: { type: Schema.Types.Mixed, required: true }, // { fieldName: newValue, ... }
    // Snapshot of the current values at proposal time, so the review screen
    // can show an accurate before/after even if the record changes again
    // before this request is reviewed.
    previousValues: { type: Schema.Types.Mixed },
    reason: { type: String, trim: true }, // employee's note on why - e.g. "he told me his number changed"
    relatedActivityLogId: { type: Schema.Types.ObjectId, ref: "ActivityLog" },
    proposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

ChangeRequestSchema.index({ status: 1, createdAt: -1 });
ChangeRequestSchema.index({ entityType: 1, entityId: 1 });

module.exports = models.ChangeRequest || model("ChangeRequest", ChangeRequestSchema);
