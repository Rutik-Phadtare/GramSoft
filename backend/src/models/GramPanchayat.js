const { Schema, model, models } = require("mongoose");
const { RateRowSchema } = require("./gramPanchayatRateRow");

const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque", "other"];
// Maintained by the controller (not user-editable directly) so it's always
// consistent with isUsingOurSoftware/softwareStartDate, and can be filtered
// on directly as a real indexed field instead of recomputed per query:
//   active      - currently using our software
//   churned     - used it before, not anymore (we have a start date on file)
//   never_used  - never been a customer
const SOFTWARE_USAGE_STATUSES = ["active", "churned", "never_used"];
const GP_TYPES = ["single", "group"]; // ग्रामपंचायत / ग्रुपग्रामपंचायत
const WATER_SUPPLY_MODES = ["combined", "separate"]; // एकत्र / वेगळा

const GramPanchayatSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    nameMr: { type: String, trim: true },
    nameKey: { type: String, required: true }, // normalized name, used for dedupe matching
    taluka: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    pincode: { type: String, trim: true },
    officePhone: { type: String, trim: true },
    officeEmail: { type: String, trim: true, lowercase: true },
    population: { type: Number, min: 0 },
    numberOfHouseholds: { type: Number, min: 0 },

    // Registration-form specifics (मु.पो., ग्रामपंचायत/ग्रुपग्रामपंचायत,
    // पाणीपुरवठा विभाग, फेरआकारणी वर्ष) - all optional since a GP created
    // through the ordinary "Add Grampanchayat" flow won't have these yet.
    mukamPost: { type: String, trim: true },
    gpType: { type: String, enum: GP_TYPES },
    waterSupplyMode: { type: String, enum: WATER_SUPPLY_MODES },
    reassessmentYearFrom: { type: String, trim: true },
    reassessmentYearTo: { type: String, trim: true },
    taxRates: [RateRowSchema],
    constructionRates: [RateRowSchema],
    landRates: [RateRowSchema],

    isUsingOurSoftware: { type: Boolean, default: false },
    softwareUsageStatus: { type: String, enum: SOFTWARE_USAGE_STATUSES, default: "never_used" },
    previousSoftwareUsed: { type: String, trim: true },
    softwareStartDate: { type: Date }, // when they first came on board
    subscriptionEndDate: { type: Date }, // renewal/deadline date - or the date they churned, if no longer active
    subscriptionYears: { type: Number, min: 0 }, // contract length purchased, in years
    priceAmount: { type: Number, min: 0 }, // what we sell them at
    paymentMode: { type: String, enum: PAYMENT_MODES },

    status: { type: String, enum: ["active", "prospect", "inactive"], default: "prospect" },
    lastContactedAt: { type: Date },
    customFields: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// A Grampanchayat name repeats across talukas/districts in Maharashtra, so
// the dedupe key is the pair, not the name alone.
GramPanchayatSchema.index({ nameKey: 1, taluka: 1 }, { unique: true });
GramPanchayatSchema.index({ name: "text", nameMr: "text" });
GramPanchayatSchema.index({ taluka: 1 });
GramPanchayatSchema.index({ district: 1 });
GramPanchayatSchema.index({ softwareUsageStatus: 1 });

// Defaults matching the categories on the client's actual paper form - the
// registration form and a brand-new GP's editable tax config both start
// from these, with rates left blank until filled in.
const DEFAULT_TAX_RATES = [
  { labelEn: "Hut / mud house", labelMr: "झोपडी मातीचे घर" },
  { labelEn: "Stone-brick-mud building", labelMr: "दगड विटा मातीची इमारत" },
  { labelEn: "Stone-brick-cement / load-bearing building", labelMr: "दगड विटा सिमेंट / लोडबेअरींग इमारत" },
  { labelEn: "RCC", labelMr: "आर.सी.सी." },
  { labelEn: "Land / open plot", labelMr: "जमिन/खुली जागा" },
  { labelEn: "Electricity/health tax (1-300)", labelMr: "विज/आरोग्य कर १ ते ३००" },
  { labelEn: "Electricity/health tax (301-700)", labelMr: "विज/आरोग्य कर ३०१ ते ७००" },
  { labelEn: "Electricity/health tax (701+)", labelMr: "विज/आरोग्य कर ७०१ ते पुढे" },
  { labelEn: "General water tax", labelMr: "सामान्य पाणीपट्टी" },
  { labelEn: "Special water tax", labelMr: "खास पाणीपट्टी" },
];
const DEFAULT_CONSTRUCTION_RATES = [
  { labelEn: "RCC", labelMr: "आर.सी.सी." },
  { labelEn: "Other pucca", labelMr: "इतर पक्के" },
  { labelEn: "Semi-pucca", labelMr: "अर्ध पक्के" },
  { labelEn: "Kachcha", labelMr: "कच्चे" },
];
const DEFAULT_LAND_RATES = [
  { labelEn: "Gavthan (village site)", labelMr: "गावठाण" },
  { labelEn: "Highway-adjacent land", labelMr: "हायवेवरील जमिनी" },
  { labelEn: "Non-agricultural land / plot", labelMr: "बिनशेती जमिनी/भूखंड" },
  { labelEn: "Industrial non-agricultural land", labelMr: "औद्योगिक बिनशेती जमिनी" },
  { labelEn: "Dry (rain-fed) farmland", labelMr: "जिरायत शेत जमीन" },
];

const GramPanchayatModel = models.GramPanchayat || model("GramPanchayat", GramPanchayatSchema);
GramPanchayatModel.PAYMENT_MODES = PAYMENT_MODES;
GramPanchayatModel.SOFTWARE_USAGE_STATUSES = SOFTWARE_USAGE_STATUSES;
GramPanchayatModel.GP_TYPES = GP_TYPES;
GramPanchayatModel.WATER_SUPPLY_MODES = WATER_SUPPLY_MODES;
GramPanchayatModel.DEFAULT_TAX_RATES = DEFAULT_TAX_RATES;
GramPanchayatModel.DEFAULT_CONSTRUCTION_RATES = DEFAULT_CONSTRUCTION_RATES;
GramPanchayatModel.DEFAULT_LAND_RATES = DEFAULT_LAND_RATES;

module.exports = GramPanchayatModel;
