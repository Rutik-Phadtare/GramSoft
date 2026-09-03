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
