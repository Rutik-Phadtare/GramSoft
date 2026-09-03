const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const { normalizeName, normalizePhone } = require("./normalize");

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
 * @returns {Promise<{gramPanchayatId: string, gramPanchayatWasNew: boolean, personId?: string, personWasNew?: boolean, assignmentWasNew?: boolean}>}
 */
async function upsertGramPanchayatAndPerson(input) {
  const taluka = (input.taluka || "unspecified").trim();
  const district = (input.district || "unspecified").trim();
  const nameKey = normalizeName(input.gramPanchayatName);
  const isUsingOurSoftware = input.isUsingOurSoftware ?? false;

  const gpUpsert = await GramPanchayat.findOneAndUpdate(
    { nameKey, taluka },
    {
      $setOnInsert: {
        name: input.gramPanchayatName,
        nameKey,
        taluka,
        district,
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

  const result = {
    gramPanchayatId: gpDoc._id.toString(),
    gramPanchayatWasNew,
  };

  if (!input.personName) return result;

  const phone = normalizePhone(input.phone);
  const personNameKey = normalizeName(input.personName);
  const designation = input.designation || "Other";

  let personDoc;
  let personWasNew;

  if (phone) {
    const upsert = await Person.findOneAndUpdate(
      { phone },
      {
        $setOnInsert: {
          name: input.personName,
          nameKey: personNameKey,
          designation,
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
    // No phone to key off - best-effort match on name + district.
    const found = await Person.findOne({ nameKey: personNameKey, district });
    if (found) {
      personDoc = found;
      personWasNew = false;
    } else {
      personDoc = await Person.create({
        name: input.personName,
        nameKey: personNameKey,
        designation,
        email: input.email,
        district,
      });
      personWasNew = true;
    }
  }

  result.personId = personDoc._id.toString();
  result.personWasNew = personWasNew;

  const existingOpen = await PersonAssignment.findOne({
    personId: personDoc._id,
    gramPanchayatId: gpDoc._id,
    toDate: null,
  });
  if (existingOpen) {
    result.assignmentWasNew = false;
  } else {
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
