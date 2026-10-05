const { Schema, model, models } = require("mongoose");
const { DESIGNATIONS } = require("./Person");

// Activity types are admin-managed via ActivityTypeConfig (see
// controllers/activityTypeController.js), so this is deliberately just
// `String`, validated against the active config list in the controller
// layer instead of a schema-level enum.

const ActivityLogSchema = new Schema(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true }, // set server-side to "today" at creation, never client-supplied
    type: { type: String, required: true, trim: true },
    gramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat" },
    personId: { type: Schema.Types.ObjectId, ref: "Person" },
    // Snapshot the designation as it was at the time of contact - a
    // person's role can change later, but this record should reflect what
    // was true then.
    designationSnapshot: { type: String, enum: DESIGNATIONS },
    notes: { type: String, required: true, trim: true },
    // Sales/demo/promotional-call entries
    clientInterest: { type: String, enum: ["interested", "not_interested", "neutral", "needs_follow_up"] },
    // Support entries
    problemSolved: { type: String, trim: true },
    // How long the call/visit took, in minutes - collected for support and
    // promotional entries alike so time-on-task is reportable across the
    // board, not just for support.
    durationMinutes: { type: Number, min: 0 },
    nextFollowUpDate: { type: Date },
    customFields: { type: Schema.Types.Mixed },
    // Snapshot of the new contact the employee described while logging this
    // activity (they weren't in the directory yet). The approvable proposal
    // itself lives in ChangeRequest; this copy keeps the activity record
    // self-contained for Admin even if that request is later edited/rejected.
    newContactProposal: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivityLogSchema.index({ employeeId: 1, date: -1 });
ActivityLogSchema.index({ gramPanchayatId: 1, date: -1 });
ActivityLogSchema.index({ personId: 1, date: -1 });
ActivityLogSchema.index({ type: 1, date: -1 });

module.exports = models.ActivityLog || model("ActivityLog", ActivityLogSchema);
