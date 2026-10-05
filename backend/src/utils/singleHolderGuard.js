const PersonAssignment = require("../models/PersonAssignment");
const ChangeHistory = require("../models/ChangeHistory");
const Person = require("../models/Person");

// Designations a Grampanchayat can only have ONE current (open) holder of at a
// time: a village has exactly one sitting Talathi/Gramsevak/Sarpanch/Sachiv.
// "Computer Operator" and "Other" are MULTI-holder: a GP can have several
// current people in those roles, so they never conflict or trigger replacement.
// Explicit list (not "everything except X") so adding a new designation to
// Person.DESIGNATIONS never silently becomes single-holder.
const SINGLE_HOLDER_DESIGNATIONS = ["Talathi", "Gramsevak", "Sarpanch", "Sachiv"].filter((d) =>
  Person.DESIGNATIONS.includes(d)
);
const MULTI_HOLDER_DESIGNATIONS = Person.DESIGNATIONS.filter((d) => !SINGLE_HOLDER_DESIGNATIONS.includes(d));

const isSingleHolder = (designation) => SINGLE_HOLDER_DESIGNATIONS.includes(designation);

/**
 * Looks for an existing *different* person currently holding `designation`
 * at `gramPanchayatId`. Returns null if the designation isn't a
 * single-holder role, or if nobody else currently holds it there.
 */
async function findHolderConflict({ gramPanchayatId, designation, excludePersonId }) {
  if (!isSingleHolder(designation)) return null;

  const conflict = await PersonAssignment.findOne({
    gramPanchayatId,
    toDate: null,
    designationAtAssignment: designation,
    personId: { $ne: excludePersonId },
  }).populate("personId", "name nameMr phone email designation designationMr");

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

module.exports = { SINGLE_HOLDER_DESIGNATIONS, MULTI_HOLDER_DESIGNATIONS, isSingleHolder, findHolderConflict, replaceHolder };
