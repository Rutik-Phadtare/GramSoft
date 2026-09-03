const { Schema, model, models } = require("mongoose");
const { DESIGNATIONS } = require("./Person");

const PersonAssignmentSchema = new Schema(
  {
    personId: { type: Schema.Types.ObjectId, ref: "Person", required: true },
    gramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat", required: true },
    designationAtAssignment: { type: String, enum: DESIGNATIONS, required: true },
    fromDate: { type: Date, required: true, default: Date.now },
    toDate: { type: Date, default: null }, // null = this is the person's current posting here
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One person can't have two open (toDate: null) assignments to the same
// Grampanchayat at once — prevents duplicate current-postings on re-import.
PersonAssignmentSchema.index({ personId: 1, gramPanchayatId: 1, toDate: 1 });
PersonAssignmentSchema.index({ gramPanchayatId: 1, toDate: 1 });

module.exports = models.PersonAssignment || model("PersonAssignment", PersonAssignmentSchema);
