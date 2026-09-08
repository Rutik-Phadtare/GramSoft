const XLSX = require("xlsx");
const { upsertGramPanchayatAndPerson } = require("../utils/upsertGramPanchayatAndPerson");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const Person = require("../models/Person");
const { isPlaceholderName } = require("../utils/normalize");

// Expected columns in the uploaded sheet (header names are matched
// case-insensitively, spaces/underscores interchangeable):
//
//   Required on every row:
//     taluka, taluka_marathi, district, district_marathi,
//     designation, designation_marathi, phone
//   Required, but bilingual - at least one of each pair must be a real name:
//     grampanchayat_name / grampanchayat_name_marathi
//     person_name / person_name_marathi
//   Optional:
//     population, number_of_households, is_using_software, previous_software,
//     software_start_date, email
//
// grampanchayat_name and person_name are each optional as long as their
// Marathi counterpart is filled in (Marathi-only rows are allowed) - but at
// least one language is still required for each. A placeholder value like
// "_", "-", or "N/A" left over from an older template is never treated as a
// real name in either language (see isPlaceholderName) - it's the same as
// that column being blank.
//
// One row = one Grampanchayat + one contact person at it. A row missing any
// required field is skipped (with an explanatory error) rather than failing
// the whole import, so one bad row doesn't block the rest of the sheet.
//
// The same person_name (and phone) can legitimately appear on multiple rows
// against different Grampanchayats - one person can be posted to more than
// one GP at a time (e.g. a Talathi covering several villages). That's not
// treated as a duplicate: see utils/upsertGramPanchayatAndPerson.js, which
// matches the existing Person and adds a second posting (PersonAssignment)
// instead of erroring or creating a duplicate contact.

const VALID_DESIGNATIONS = Person.DESIGNATIONS;

function getField(row, ...keys) {
  const rowKeys = Object.keys(row);
  for (const wantedKey of keys) {
    const match = rowKeys.find(
      (k) => k.trim().toLowerCase().replace(/[\s_]+/g, "") === wantedKey.replace(/[\s_]+/g, "")
    );
    if (match && row[match] !== undefined && row[match] !== null && row[match] !== "") {
      return String(row[match]).trim();
    }
  }
  return undefined;
}

function parseBoolean(value) {
  if (!value) return false;
  return ["yes", "true", "y", "1"].includes(value.trim().toLowerCase());
}

function parseDesignation(value) {
  if (!value) return "Other";
  const match = VALID_DESIGNATIONS.find((d) => d.toLowerCase() === value.trim().toLowerCase());
  return match ?? "Other";
}

// Reads every mandatory column for a row and reports back which (if any)
// are missing, so the caller can skip the row with one clear error message
// instead of a generic/partial failure.
function readRequiredFields(row) {
  const values = {};
  const missing = [];

  values.gpName = getField(row, "grampanchayat_name", "grampanchayat", "gp_name", "village");
  values.gpNameMr = getField(row, "grampanchayat_name_marathi", "grampanchayat_marathi", "gp_name_marathi", "village_marathi");
  values.taluka = getField(row, "taluka");
  values.talukaMr = getField(row, "taluka_marathi");
  values.district = getField(row, "district");
  values.districtMr = getField(row, "district_marathi");
  values.personName = getField(row, "person_name", "contact_name", "talathi_name");
  values.personNameMr = getField(row, "person_name_marathi", "contact_name_marathi", "talathi_name_marathi");
  values.designation = getField(row, "designation", "role");
  values.designationMr = getField(row, "designation_marathi", "role_marathi");
  values.phone = getField(row, "phone", "mobile", "contact_number");

  // A leftover placeholder ("_", "-", "N/A", ...) is never a real name in
  // either language - treat it exactly like the column being blank, both so
  // it can't satisfy the "at least one language" check below and so it
  // never becomes part of a dedupe key (see upsertGramPanchayatAndPerson.js).
  if (isPlaceholderName(values.gpName)) values.gpName = undefined;
  if (isPlaceholderName(values.gpNameMr)) values.gpNameMr = undefined;
  if (isPlaceholderName(values.personName)) values.personName = undefined;
  if (isPlaceholderName(values.personNameMr)) values.personNameMr = undefined;

  // grampanchayat_name and person_name are each optional as long as their
  // Marathi counterpart is a real name - but at least one language is still
  // required for each, so Marathi-only rows work while fully-blank rows
  // still get skipped with a clear error.
  if (!values.gpName && !values.gpNameMr) missing.push("grampanchayat_name or grampanchayat_name_marathi");
  if (!values.taluka) missing.push("taluka");
  if (!values.talukaMr) missing.push("taluka_marathi");
  if (!values.district) missing.push("district");
  if (!values.districtMr) missing.push("district_marathi");
  if (!values.personName && !values.personNameMr) missing.push("person_name or person_name_marathi");
  if (!values.designation) missing.push("designation");
  if (!values.designationMr) missing.push("designation_marathi");
  if (!values.phone) missing.push("phone");

  return { values, missing };
}

// POST /api/import - multipart/form-data, field name "file"
const importSpreadsheet = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

  const results = [];
  let gramPanchayatsCreated = 0;
  let gramPanchayatsMatched = 0;
  let personsCreated = 0;
  let personsMatched = 0;
  let assignmentsCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // account for header row, 1-indexed sheet rows
    const row = rows[i];

    try {
      const { values: f, missing } = readRequiredFields(row);
      if (missing.length) {
        results.push({
          row: rowNum,
          gramPanchayat: "skipped",
          person: "skipped",
          assignment: "skipped",
          error: `Missing required field(s): ${missing.join(", ")}`,
        });
        continue;
      }

      const result = await upsertGramPanchayatAndPerson({
        gramPanchayatName: f.gpName,
        gramPanchayatNameMr: f.gpNameMr,
        taluka: f.taluka,
        talukaMr: f.talukaMr,
        district: f.district,
        districtMr: f.districtMr,
        population: getField(row, "population") ? Number(getField(row, "population")) : undefined,
        numberOfHouseholds: getField(row, "number_of_households", "households")
          ? Number(getField(row, "number_of_households", "households"))
          : undefined,
        isUsingOurSoftware: parseBoolean(getField(row, "is_using_software", "using_software")),
        previousSoftwareUsed: getField(row, "previous_software", "previous_software_used"),
        softwareStartDate: getField(row, "software_start_date") ? new Date(getField(row, "software_start_date")) : undefined,
        personName: f.personName,
        personNameMr: f.personNameMr,
        designation: parseDesignation(f.designation),
        designationMr: f.designationMr,
        phone: f.phone,
        email: getField(row, "email"),
        replaceExistingHolder: true,
        changedBy: req.user?.id,
      });

      result.gramPanchayatWasNew ? gramPanchayatsCreated++ : gramPanchayatsMatched++;
      if (result.personId) {
        result.personWasNew ? personsCreated++ : personsMatched++;
      }
      if (result.assignmentWasNew) assignmentsCreated++;

      results.push({
        row: rowNum,
        gramPanchayat: result.gramPanchayatWasNew ? "created" : "matched",
        person: result.personId ? (result.personWasNew ? "created" : "matched") : "skipped",
        assignment: result.personId
          ? (result.assignmentWasNew
              ? (result.assignmentWasReplacement ? "replaced" : "created")
              : "already_current")
          : "skipped",
      });
    } catch (err) {
      results.push({ row: rowNum, gramPanchayat: "skipped", person: "skipped", assignment: "skipped", error: err.message ?? "Unknown error" });
    }
  }

  const summary = { gramPanchayatsCreated, gramPanchayatsMatched, personsCreated, personsMatched, assignmentsCreated };
  emitToAdmins("import:completed", { totalRows: rows.length, summary });

  return res.json({ totalRows: rows.length, summary, rows: results });
});

module.exports = { importSpreadsheet };
