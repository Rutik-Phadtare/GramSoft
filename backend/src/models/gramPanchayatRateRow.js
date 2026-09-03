const { Schema } = require("mongoose");

// A single rate-table row: a fixed category (e.g. "RCC construction") with
// a bilingual label plus whatever numeric rates that table tracks. Shared
// between GramPanchayat (the live, editable config) and
// RegistrationFormResponse (the raw public submission before it's merged),
// so both use exactly the same shape.
const RateRowSchema = new Schema(
  {
    labelEn: { type: String, required: true, trim: true },
    labelMr: { type: String, trim: true },
    minRate: { type: Number },
    maxRate: { type: Number },
    panchayatRate: { type: Number }, // the rate the panchayat actually settled on
    ratePerSqm: { type: Number }, // used by construction-rate / land-rate tables instead of min/max/panchayat
  },
  { _id: false }
);

module.exports = { RateRowSchema };
