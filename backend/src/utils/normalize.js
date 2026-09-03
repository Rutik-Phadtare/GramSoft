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

module.exports = { normalizeName, normalizePhone, escapeRegex };
