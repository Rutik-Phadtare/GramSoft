const { Schema, model, models } = require("mongoose");
const { RateRowSchema } = require("./gramPanchayatRateRow");

// The public "new Grampanchayat wants our software" intake form - a direct
// digital replica of the client's real paper registration form (office
// details, Sarpanch/Gramsevak/Computer Operator contacts, and the three
// rate tables). Same lifecycle as FeedbackFormResponse: submitted publicly,
// reviewed, then "merged" into the real GramPanchayat/Person/
// PersonAssignment records without creating duplicates.
const RegistrationFormResponseSchema = new Schema(
  {
    gramPanchayatName: { type: String, required: true, trim: true },
    gramPanchayatNameMr: { type: String, trim: true },
    mukamPost: { type: String, trim: true },
    taluka: { type: String, trim: true },
    district: { type: String, trim: true },
    pincode: { type: String, trim: true },
    officePhone: { type: String, trim: true },
    officeEmail: { type: String, trim: true, lowercase: true },
    gpType: { type: String, enum: ["single", "group"] },

    sarpanchName: { type: String, trim: true },
    sarpanchNameMr: { type: String, trim: true },
    sarpanchPhone: { type: String, trim: true },
    sarpanchEmail: { type: String, trim: true, lowercase: true },

    gramsevakName: { type: String, trim: true },
    gramsevakNameMr: { type: String, trim: true },
    gramsevakPhone: { type: String, trim: true },
    gramsevakEmail: { type: String, trim: true, lowercase: true },

    computerOperatorName: { type: String, trim: true },
    computerOperatorNameMr: { type: String, trim: true },
    computerOperatorPhone: { type: String, trim: true },
    computerOperatorEmail: { type: String, trim: true, lowercase: true },

    waterSupplyMode: { type: String, enum: ["combined", "separate"] },
    reassessmentYearFrom: { type: String, trim: true },
    reassessmentYearTo: { type: String, trim: true },

    taxRates: [RateRowSchema],
    constructionRates: [RateRowSchema],
    landRates: [RateRowSchema],
    customFields: { type: Schema.Types.Mixed },

    status: { type: String, enum: ["new", "reviewed", "merged"], default: "new" },
    mergedGramPanchayatId: { type: Schema.Types.ObjectId, ref: "GramPanchayat" },
  },
  { timestamps: { createdAt: "submittedAt", updatedAt: true } }
);

module.exports =
  models.RegistrationFormResponse || model("RegistrationFormResponse", RegistrationFormResponseSchema);
