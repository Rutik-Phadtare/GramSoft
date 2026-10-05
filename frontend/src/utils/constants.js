import { translations } from "../i18n/translations";

// Single source of truth for the designation list, so adding "Computer
// Operator" here updates every picker/filter in the app at once instead of
// needing to find every place it was previously hardcoded.
export const DESIGNATIONS = ["Talathi", "Gramsevak", "Sarpanch", "Sachiv", "Computer Operator", "Other"];

// Maps a designation value to its translation-dictionary key, since
// "Computer Operator" isn't a valid object-key/identifier on its own.
const DESIGNATION_KEY_MAP = {
  Talathi: "designation_Talathi",
  Gramsevak: "designation_Gramsevak",
  Sarpanch: "designation_Sarpanch",
  Sachiv: "designation_Sachiv",
  "Computer Operator": "designation_ComputerOperator",
  Other: "designation_Other",
};

export function designationTranslationKey(designation) {
  return DESIGNATION_KEY_MAP[designation] || "designation_Other";
}

// "Talathi — तलाठी": English + Marathi from the existing translation
// dictionaries (no second copy of the labels), used by every designation picker.
export function designationMarathi(designation) {
  return translations.mr[designationTranslationKey(designation)] || "";
}
export function designationBilingualLabel(designation) {
  const key = designationTranslationKey(designation);
  const en = translations.en[key] || designation;
  const mr = translations.mr[key];
  return mr && mr !== en ? `${en} — ${mr}` : en;
}

// Keeps English + Marathi designation in sync from the one mapping above:
// choosing either side resolves the other. Legacy/custom Marathi text that
// isn't in the mapping is left untouched until the user picks something.
export function applyDesignationChange(form, field, value) {
  if (field === "designation") return { ...form, designation: value, designationMr: value ? designationMarathi(value) : "" };
  const en = DESIGNATIONS.find((d) => designationMarathi(d) === value);
  return { ...form, designationMr: value, ...(en ? { designation: en } : {}) };
}
