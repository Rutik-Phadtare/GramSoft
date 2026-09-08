const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const { normalizeName, normalizePhone } = require("./normalize");
const { findHolderConflict, replaceHolder } = require("./singleHolderGuard");

// Kept identical to the one in gramPanchayatController.js so a Grampanchayat
// ends up with the same computed status whether it arrives via bulk import,
// a feedback-form merge, or the admin "add" form.
function computeSoftwareUsageStatus(isUsingOurSoftware, softwareStartDate) {
  if (isUsingOurSoftware) return "active";
  if (softwareStartDate) return "churned";
  return "never_used";
}

/**
 * Finds-or-creates a Grampanchayat and (optionally) a contact person at it,
 * plus the posting/assignment linking them - without ever creating a
 * duplicate. Same logic used by the bulk Excel import and by merging a
 * public feedback-form submission, so both paths dedupe identically.
 *
 * @param {object} input
 * @returns {Promise<{gramPanchayatId: string, gramPanchayatWasNew: boolean, personId?: string, personWasNew?: boolean, assignmentWasNew?: boolean, assignmentWasReplacement?: boolean}>}
 */
async function upsertGramPanchayatAndPerson(input) {
  const taluka = (input.taluka || "unspecified").trim();
  const district = (input.district || "unspecified").trim();
  // Safe GP matching: when the English name is available, match/dedupe on
  // it (existing behavior, unchanged). When it isn't (Marathi-only row),
  // fall back to the normalized Marathi name for the same {nameKey, taluka}
  // matching - so re-importing the same Marathi-only GP still finds the
  // same record instead of creating a duplicate, and it never collides with
  // an unrelated GP just because both rows are missing an English name.
  const nameKey = input.gramPanchayatName
    ? normalizeName(input.gramPanchayatName)
    : normalizeName(input.gramPanchayatNameMr);
  const isUsingOurSoftware = input.isUsingOurSoftware ?? false;

  const gpUpsert = await GramPanchayat.findOneAndUpdate(
    { nameKey, taluka },
    {
      $setOnInsert: {
        name: input.gramPanchayatName,
        nameMr: input.gramPanchayatNameMr,
        nameKey,
        taluka,
        talukaMr: input.talukaMr,
        district,
        districtMr: input.districtMr,
        population: input.population,
        numberOfHouseholds: input.numberOfHouseholds,
        isUsingOurSoftware,
        softwareUsageStatus: computeSoftwareUsageStatus(isUsingOurSoftware, input.softwareStartDate),
        previousSoftwareUsed: input.previousSoftwareUsed,
        softwareStartDate: input.softwareStartDate,
        status: "prospect",
      },
    },
    { upsert: true, new: true, includeResultMetadata: true }
  );
  const gpDoc = gpUpsert.value;
  const gramPanchayatWasNew = !gpUpsert.lastErrorObject?.updatedExisting;

  // A GP that already existed (e.g. created before Marathi columns were
  // captured, or matched from an earlier plain "Add Grampanchayat" entry)
  // may be missing nameMr/talukaMr/districtMr. If this row now supplies
  // them, fill in just the blanks - never overwrite a value someone already
  // recorded, so re-importing can't clobber a manual edit.
  if (!gramPanchayatWasNew) {
    const fill = {};
    if (!gpDoc.nameMr && input.gramPanchayatNameMr) fill.nameMr = input.gramPanchayatNameMr;
    if (!gpDoc.talukaMr && input.talukaMr) fill.talukaMr = input.talukaMr;
    if (!gpDoc.districtMr && input.districtMr) fill.districtMr = input.districtMr;
    if (Object.keys(fill).length) {
      await GramPanchayat.updateOne({ _id: gpDoc._id }, { $set: fill });
      Object.assign(gpDoc, fill);
    }
  }

  const result = {
    gramPanchayatId: gpDoc._id.toString(),
    gramPanchayatWasNew,
  };

  if (!input.personName && !input.personNameMr) return result;

  const phone = normalizePhone(input.phone);
  // Same English-first, Marathi-fallback matching as the GP above.
  const personNameKey = input.personName
    ? normalizeName(input.personName)
    : normalizeName(input.personNameMr);
  const designation = input.designation || "Other";

  let personDoc;
  let personWasNew;

  if (phone) {
    const upsert = await Person.findOneAndUpdate(
      { phone },
      {
        $setOnInsert: {
          name: input.personName,
          nameMr: input.personNameMr,
          nameKey: personNameKey,
          designation,
          designationMr: input.designationMr,
          phone,
          email: input.email,
          district,
        },
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    personDoc = upsert.value;
    personWasNew = !upsert.lastErrorObject?.updatedExisting;
  } else {
    // No phone to key off - best-effort match on name + district. Note this
    // intentionally does NOT also match on gramPanchayatId/designation: the
    // same person (same name, same home district) can be posted at several
    // different Grampanchayats at once - see PersonAssignment - so matching
    // stays keyed on "same person", and which GP(s) they're posted to is
    // handled entirely below, via assignments, not by creating a new Person
    // per GP.
    const found = await Person.findOne({ nameKey: personNameKey, district });
    if (found) {
      personDoc = found;
      personWasNew = false;
    } else {
      personDoc = await Person.create({
        name: input.personName,
        nameMr: input.personNameMr,
        nameKey: personNameKey,
        designation,
        designationMr: input.designationMr,
        email: input.email,
        district,
      });
      personWasNew = true;
    }
  }

  if (!personWasNew) {
    const fill = {};
    if (!personDoc.nameMr && input.personNameMr) fill.nameMr = input.personNameMr;
    if (!personDoc.designationMr && input.designationMr) fill.designationMr = input.designationMr;
    if (Object.keys(fill).length) {
      await Person.updateOne({ _id: personDoc._id }, { $set: fill });
      Object.assign(personDoc, fill);
    }
  }

  result.personId = personDoc._id.toString();
  result.personWasNew = personWasNew;

  // One person can currently be posted at more than one Grampanchayat at a
  // time (e.g. a Talathi covering two villages) - so this only checks for a
  // duplicate *open assignment to this same GP*, never against the person's
  // other open assignments elsewhere. Re-importing the same sheet is
  // idempotent; importing the person against a second GP correctly adds a
  // second posting instead of being blocked.
  const existingOpen = await PersonAssignment.findOne({
    personId: personDoc._id,
    gramPanchayatId: gpDoc._id,
    toDate: null,
  });
  if (existingOpen) {
    result.assignmentWasNew = false;
    result.assignmentWasReplacement = false;
  } else {
    // Bulk import can opt into the same single-holder rule used by the admin
    // contact/transfer flows: one active holder per GP/designation. When a
    // different person arrives for the same post, close the old assignment
    // first so it appears under past contacts/history instead of leaving two
    // active holders for the same designation. "Other" intentionally remains
    // multi-holder, matching the existing singleHolderGuard contract.
    if (input.replaceExistingHolder) {
      const conflict = await findHolderConflict({
        gramPanchayatId: gpDoc._id,
        designation,
        excludePersonId: personDoc._id,
      });
      if (conflict) {
        await replaceHolder({
          conflict,
          gramPanchayatId: gpDoc._id,
          designation,
          newPerson: personDoc,
          changedBy: input.changedBy,
        });
        result.assignmentWasReplacement = true;
      } else {
        result.assignmentWasReplacement = false;
      }
    } else {
      result.assignmentWasReplacement = false;
    }

    await PersonAssignment.create({
      personId: personDoc._id,
      gramPanchayatId: gpDoc._id,
      designationAtAssignment: designation,
      fromDate: new Date(),
      toDate: null,
    });
    result.assignmentWasNew = true;
  }

  return result;
}

module.exports = { upsertGramPanchayatAndPerson };
