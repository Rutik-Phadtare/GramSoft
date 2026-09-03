const { Schema, model, models } = require("mongoose");

const FeedbackFormResponseSchema = new Schema(
  {
    gramPanchayatName: { type: String, required: true, trim: true },
    taluka: { type: String, trim: true },
    district: { type: String, trim: true },
    population: { type: Number, min: 0 },
    numberOfHouseholds: { type: Number, min: 0 },
    isUsingOurSoftware: { type: Boolean, required: true },
    previousSoftwareUsed: { type: String, trim: true },
    softwareStartDate: { type: Date },
    likedFeatures: { type: String, trim: true },
    improvementSuggestions: { type: String, trim: true },
    respondentName: { type: String, required: true, trim: true },
    respondentDesignation: { type: String, required: true, trim: true },
    respondentPhone: { type: String, trim: true },
    respondentEmail: { type: String, trim: true, lowercase: true },
    additionalInfo: { type: String, trim: true },
    customFields: { type: Schema.Types.Mixed },
    status: { type: String, enum: ["new", "reviewed", "merged"], default: "new" },
    mergedGramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat" },
    mergedPersonId: { type: Schema.Types.ObjectId, ref: "Person" },
  },
  { timestamps: { createdAt: "submittedAt", updatedAt: true } }
);

module.exports =
  models.FeedbackFormResponse || model("FeedbackFormResponse", FeedbackFormResponseSchema);
