const ChangeHistory = require("../models/ChangeHistory");

// Loose equality good enough for comparing plain field values (strings,
// numbers, booleans, dates-as-strings) coming out of Mongoose documents -
// not meant for deep objects/arrays.
function valuesDiffer(a, b) {
  const normalize = (v) => (v === undefined || v === null || v === "" ? null : v);
  const na = normalize(a);
  const nb = normalize(b);
  if (na instanceof Date || nb instanceof Date) {
    return new Date(na).getTime() !== new Date(nb).getTime();
  }
  return na !== nb;
}

/**
 * Compares `updates` (the fields someone is about to change) against the
 * current document, and writes one ChangeHistory row per field that
 * actually differs. Called from the update controllers *after* the save
 * succeeds, so history only ever reflects changes that really landed.
 */
async function logFieldChanges({ entityType, entityId, before, updates, changedBy, source = "direct" }) {
  const rows = [];
  for (const field of Object.keys(updates)) {
    const oldValue = before[field];
    const newValue = updates[field];
    if (valuesDiffer(oldValue, newValue)) {
      rows.push({
        entityType,
        entityId,
        field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        changedBy: changedBy || undefined,
        source,
      });
    }
  }
  if (rows.length) {
    await ChangeHistory.insertMany(rows);
  }
  return rows;
}

module.exports = { logFieldChanges, valuesDiffer };
