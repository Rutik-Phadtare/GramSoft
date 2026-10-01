const { Schema, model, models } = require("mongoose");

// Two spellings of the same district/taluka key that are one place. Learned
// automatically when a single record carries both spellings (utils/geo.js).
const GeoAliasSchema = new Schema(
  {
    type: { type: String, enum: ["district", "taluka"], required: true },
    alias: { type: String, required: true },
    canonical: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
GeoAliasSchema.index({ type: 1, alias: 1 }, { unique: true });

module.exports = models.GeoAlias || model("GeoAlias", GeoAliasSchema);
