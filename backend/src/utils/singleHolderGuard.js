const PersonAssignment = require("../models/PersonAssignment");
const ChangeHistory = require("../models/ChangeHistory");
const Person = require("../models/Person");

// Designations a Grampanchayat can only have ONE current (open) holder of
// at a time - a village has exactly one sitting Talathi/Sarpanch/Gramsevak/
// Sachiv/Computer Operator. "Other" is deliberately excluded: it's a
// catch-all bucket (peons, clerks, etc.) that legitimately has many people
// at once, so it's never subject to this rule.
const SINGLE_HOLDER_DESIGNATIONS = Person.DESIGNATIONS.filter((d) => d !== "Other");

/**
 * Looks for an existing *different* person currently holding `designation`
 * at `gramPanchayatId`. Returns null if the designation isn't a
 * single-holder role, or if nobody else currently holds it there.
 */
async function findHolderConflict({ gramPanchayatId, designation, excludePersonId }) {
  if (!SINGLE_HOLDER_DESIGNATIONS.includes(designation)) return null;

  const conflict = await PersonAssignment.findOne({
    gramPanchayatId,
    toDate: null,
    designationAtAssignment: designation,
    personId: { $ne: excludePersonId },
  }).populate("personId", "name nameMr phone email designation");

  return conflict || null;
}

/**
 * Closes the conflicting assignment (moves it to that Grampanchayat's
 * "past contacts" / that person's "past postings" immediately) and writes
 * one ChangeHistory row on the Grampanchayat so "who was Talathi before"
 * shows up in the profile's change history too, not just in the postings
 * list.
 */
async function replaceHolder({ conflict, gramPanchayatId, designation, newPerson, changedBy }) {
  conflict.toDate = new Date();
  await conflict.save();

  await ChangeHistory.create({
    entityType: "GramPanchayat",
    entityId: gramPanchayatId,
    field: designation,
    oldValue: conflict.personId?.name || null,
    newValue: newPerson?.name || null,
    changedBy: changedBy || undefined,
    source: "direct",
  });

  return conflict;
}

module.exports = { SINGLE_HOLDER_DESIGNATIONS, findHolderConflict, replaceHolder };
