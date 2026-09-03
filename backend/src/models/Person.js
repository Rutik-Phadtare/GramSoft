const { Schema, model, models } = require("mongoose");

// "Computer Operator" (संगणक कर्मचारी) added alongside the original four -
// on the client's actual registration form, the person who runs their
// software day-to-day is tracked as distinctly as the Sarpanch or
// Gramsevak, so it needs to be a first-class designation, not "Other".
const DESIGNATIONS = ["Talathi", "Gramsevak", "Sarpanch", "Sachiv", "Computer Operator", "Other"];

const PersonSchema = new Schema(
  {
    // English is the original/primary field (kept as `name` rather than
    // renamed to `nameEn`, so every existing query/index/display path stays
    // valid); `nameMr` is the same person's name in Marathi script. Both are
    // meant to be typed by a person who actually knows the spelling - never
    // machine-translated, since transliteration of proper nouns is exactly
    // where automated translation gets names/places wrong.
    name: { type: String, required: true, trim: true },
    nameMr: { type: String, trim: true },
    nameKey: { type: String, required: true },
    designation: { type: String, enum: DESIGNATIONS, required: true },
    phone: { type: String, trim: true }, // normalized to last 10 digits, unique when present
    previousPhones: [{ number: String, replacedAt: Date }], // superseded numbers, oldest first
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    addressMr: { type: String, trim: true },
    district: { type: String, trim: true },
    notes: { type: String, trim: true },
    lastContactedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// Phone is the strongest dedupe signal for a person (a name alone repeats
// often, and Talathis/Gramsevaks are the ones tracked most precisely).
PersonSchema.index({ phone: 1 }, { unique: true, sparse: true });
PersonSchema.index({ nameKey: 1, district: 1 });
PersonSchema.index({ name: "text", nameMr: "text" });

const PersonModel = models.Person || model("Person", PersonSchema);
PersonModel.DESIGNATIONS = DESIGNATIONS;

module.exports = PersonModel;
