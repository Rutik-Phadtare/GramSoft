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
    // `name` (English) is no longer unconditionally required - a
    // Marathi-only bulk import row (person_name_marathi with no person_name)
    // is allowed to create a Person with only `nameMr` set. Conditionally
    // required (rather than unconditionally, as before) - only required
    // when nameMr is also blank.
    name: {
      type: String,
      trim: true,
      required: [
        function () {
          return !(this.nameMr && this.nameMr.trim());
        },
        "Either name (English) or nameMr (Marathi) is required",
      ],
    },
    nameMr: { type: String, trim: true },
    nameKey: { type: String, required: true }, // normalized name (English if present, else Marathi)
    designation: { type: String, enum: DESIGNATIONS, required: true },
    // Marathi label for the designation (e.g. "तलाठी" for "Talathi"). Kept as
    // free text rather than a second enum since the English `designation` is
    // what all filtering/single-holder logic keys off - this is display-only.
    designationMr: { type: String, trim: true },
    phone: { type: String, trim: true }, // normalized to last 10 digits, unique when present
    previousPhones: [{ number: String, replacedAt: Date }], // superseded numbers, oldest first
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    addressMr: { type: String, trim: true },
    district: { type: String, trim: true },
    districtKey: { type: String }, // language-independent, see plugins/bilingual.js
    searchKeys: { type: [String], select: false },
    identityKeys: { type: [String], select: false },
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
PersonSchema.index({ searchKeys: 1 });
PersonSchema.index({ districtKey: 1, designation: 1 });
PersonSchema.index({ districtKey: 1, identityKeys: 1 });

PersonSchema.plugin(require("./plugins/bilingual"), { kind: "person" });

const PersonModel = models.Person || model("Person", PersonSchema);
PersonModel.DESIGNATIONS = DESIGNATIONS;

module.exports = PersonModel;
