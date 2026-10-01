const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const { normalizeName, normalizePhone } = require("./normalize");
const { findHolderConflict, replaceHolder } = require("./singleHolderGuard");
const { deriveGp, derivePerson, relocateNames, sameEntity } = require("./bilingual");
const { hasDevanagari } = require("./phonetic");
const { invalidateGeoOptionsCache } = require("./geo");

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
  // A Marathi value typed into an English column (or vice versa) goes to the
  // right language slot before anything is matched or stored.
  const gpNames = relocateNames(input.gramPanchayatName, input.gramPanchayatNameMr);
  const gpIn = deriveGp({
    name: gpNames.name,
    nameMr: gpNames.nameMr,
    taluka: input.taluka,
    talukaMr: input.talukaMr,
    district: input.district,
    districtMr: input.districtMr,
  });
  const taluka = gpIn.taluka || "unspecified";
  const district = gpIn.district || "unspecified";
  const nameKey = normalizeName(gpNames.name || gpNames.nameMr);
  const isUsingOurSoftware = input.isUsingOurSoftware ?? false;

  // 1) exact legacy match (same normalized name + same taluka text);
  // 2) the same place under the other language's spelling: same district +
  //    taluka KEY (language-independent) and a matching phonetic name. Names
  //    in the same script must still be identical, so two different villages
  //    that merely sound alike are never merged.
  let gpDoc = await GramPanchayat.findOne({ nameKey, taluka });
  if (!gpDoc && gpIn.identityKeys.length && gpIn.talukaKey) {
    const candidates = await GramPanchayat.find({
      districtKey: gpIn.districtKey,
      talukaKey: gpIn.talukaKey,
      identityKeys: { $in: gpIn.identityKeys },
    }).limit(10);
    gpDoc = candidates.find((c) => sameEntity(c, { name: gpNames.name, nameMr: gpNames.nameMr })) || null;
  }
  let gramPanchayatWasNew = false;

  if (!gpDoc) {
    const gpUpsert = await GramPanchayat.findOneAndUpdate(
      { nameKey, taluka },
      {
        $setOnInsert: {
          name: gpNames.name,
          nameMr: gpNames.nameMr,
          nameKey,
          taluka,
          talukaMr: gpIn.talukaMr,
          district,
          districtMr: gpIn.districtMr,
          population: input.population,
          numberOfHouseholds: input.numberOfHouseholds,
          isUsingOurSoftware,
          softwareUsageStatus: computeSoftwareUsageStatus(
            isUsingOurSoftware,
            input.softwareStartDate
          ),
          previousSoftwareUsed: input.previousSoftwareUsed,
          softwareStartDate: input.softwareStartDate,
          status: "prospect",
        },
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );

    gpDoc = gpUpsert.value;
    gramPanchayatWasNew = !gpUpsert.lastErrorObject?.updatedExisting;
    if (gramPanchayatWasNew) invalidateGeoOptionsCache();
  }

  // A GP that already existed (entered earlier in the other language, or
  // before Marathi columns were captured) may be missing name/nameMr/
  // talukaMr/districtMr. Fill just the blanks - never overwrite a value
  // someone already recorded, so re-importing can't clobber a manual edit.
  // (districtKey/talukaKey/searchKeys refresh via the model plugin.)
  if (!gramPanchayatWasNew) {
    const fill = {};

    if (!gpDoc.nameMr && gpNames.nameMr) fill.nameMr = gpNames.nameMr;
    if (!gpDoc.name && gpNames.name) {
      fill.name = gpNames.name;
      fill.nameKey = normalizeName(gpNames.name);
    }

    if (!gpDoc.talukaMr && gpIn.talukaMr) fill.talukaMr = gpIn.talukaMr;
    if (!gpDoc.districtMr && gpIn.districtMr) fill.districtMr = gpIn.districtMr;

    // taluka/district are required, so a Marathi-only record stores Marathi
    // text there; when the English spelling arrives later, promote it.
    const latinTaluka = input.taluka && !hasDevanagari(input.taluka) ? input.taluka.trim() : null;
    if (latinTaluka && (!gpDoc.taluka || hasDevanagari(gpDoc.taluka))) {
      fill.taluka = latinTaluka;
      if (!gpDoc.talukaMr && hasDevanagari(gpDoc.taluka)) fill.talukaMr = gpDoc.taluka;
    }
    const latinDistrict = input.district && !hasDevanagari(input.district) ? input.district.trim() : null;
    if (latinDistrict && (!gpDoc.district || hasDevanagari(gpDoc.district))) {
      fill.district = latinDistrict;
      if (!gpDoc.districtMr && hasDevanagari(gpDoc.district)) fill.districtMr = gpDoc.district;
    }

    if (Object.keys(fill).length) {
      try {
        const updated = await GramPanchayat.findOneAndUpdate({ _id: gpDoc._id }, { $set: fill }, { new: true });
        if (updated) gpDoc = updated;
        invalidateGeoOptionsCache();
      } catch (err) {
        // A promoted English name/taluka can collide with another record's
        // unique (nameKey, taluka); keep the row importable and skip the fill.
        if (err.code !== 11000) throw err;
      }
    }
  }

  const result = {
    gramPanchayatId: gpDoc._id.toString(),
    gramPanchayatWasNew,
  };

  if (!input.personName && !input.personNameMr) {
    return result;
  }

  const phone = normalizePhone(input.phone);

  const personNames = relocateNames(input.personName, input.personNameMr);
  const personNameKey = normalizeName(personNames.name || personNames.nameMr);
  const personIn = derivePerson({ name: personNames.name, nameMr: personNames.nameMr, district });

  const designation = input.designation || "Other";

  let personDoc;
  let personWasNew;

  if (phone) {
    const upsert = await Person.findOneAndUpdate(
      { phone },
      {
        $setOnInsert: {
          name: personNames.name,
          nameMr: personNames.nameMr,
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
    // Same person = same district (language-independent key) and same name in either script.
    const foundCandidates = await Person.find({
      districtKey: personIn.districtKey,
      $or: [{ nameKey: personNameKey }, { identityKeys: { $in: personIn.identityKeys } }],
    }).limit(10);
    const found =
      foundCandidates.find((c) => c.nameKey === personNameKey) ||
      foundCandidates.find((c) => sameEntity(c, { name: personNames.name, nameMr: personNames.nameMr })) ||
      null;

    if (found) {
      personDoc = found;
      personWasNew = false;
    } else {
      personDoc = await Person.create({
        name: personNames.name,
        nameMr: personNames.nameMr,
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

    if (!personDoc.nameMr && personNames.nameMr) {
      fill.nameMr = personNames.nameMr;
    }

    if (!personDoc.name && personNames.name) {
      fill.name = personNames.name;
    }

    if (!personDoc.designationMr && input.designationMr) {
      fill.designationMr = input.designationMr;
    }

    if (Object.keys(fill).length) {
      await Person.updateOne(
        { _id: personDoc._id },
        { $set: fill }
      );
      Object.assign(personDoc, fill);
    }
  }

  result.personId = personDoc._id.toString();
  result.personWasNew = personWasNew;

  // One person can currently be posted at more than one Grampanchayat at a
  // time (e.g. a Talathi covering two villages) - so this only checks for a
  // duplicate open assignment to this same GP, never against the person's
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