// Every dedupe check (bulk import, form-merge, manual entry) must use these
// same functions, or two records that are "the same" on paper will end up
// with different normalized keys and both get inserted.

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return undefined;
  // Keep the last 10 digits so "+91 98765 43210" and "9876543210" match.
  return digits.slice(-10);
}

// Escapes regex special characters in user-typed search input, so a query
// like "R.K." or "(Old)" is matched literally instead of breaking the regex
// or matching more broadly than intended.
function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bulk-import sheets sometimes carry a filler value (left over from a
// template that used to require every column) instead of a real name. Those
// must never be treated as an actual English/Marathi name - counting one as
// "provided" would both (a) defeat making the other-language name optional,
// and (b) let two unrelated rows collide on the same normalized key (e.g.
// two different GPs both keyed on "n/a") and get merged together.
const PLACEHOLDER_NAME_VALUES = new Set([
  "n/a", "na", "n.a", "n.a.", "none", "nil", "null", "not applicable", "unknown", "tbd", "-", "--", "_",
]);

function isPlaceholderName(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return true;
  if (PLACEHOLDER_NAME_VALUES.has(trimmed)) return true;
  // Values that are nothing but underscores/dashes/dots (any length: "_", "___", "---", "...")
  if (/^[_\-.]+$/.test(trimmed)) return true;
  return false;
}

module.exports = { normalizeName, normalizePhone, escapeRegex, isPlaceholderName };
