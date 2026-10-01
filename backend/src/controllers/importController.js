const XLSX = require("xlsx");
const { decodeTextFile, isXlsxOrXls, fixRow } = require("../utils/textEncoding");
const { upsertGramPanchayatAndPerson } = require("../utils/upsertGramPanchayatAndPerson");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const Person = require("../models/Person");
const { isPlaceholderName } = require("../utils/normalize");

// Expected columns in the uploaded sheet (header names are matched
// case-insensitively, spaces/underscores interchangeable):
//
//   Required for every GramPanchayat:
//     taluka OR taluka_marathi
//     district OR district_marathi
//   Required, but bilingual - at least one language must be supplied:
//     grampanchayat_name / grampanchayat_name_marathi
//   Optional contact/person data:
//     person_name / person_name_marathi
//     designation / designation_marathi
//     phone, email
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
// One row always imports the GramPanchayat when its master data is valid.
// Contact/person data is optional enrichment. A row with GP + taluka + district
// but no person is valid and creates/matches only the GramPanchayat. A row
// missing a required GP master field is skipped without blocking the rest.
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

const DESIGNATION_ALIASES_MR = new Map([
  ["तलाठी", "Talathi"],
  ["ग्रामसेवक", "Gramsevak"],
  ["ग्राम सेवक", "Gramsevak"],
  ["सरपंच", "Sarpanch"],
  ["सचिव", "Sachiv"],
  ["ग्रामपंचायत सचिव", "Sachiv"],
  ["संगणक कर्मचारी", "Computer Operator"],
  ["संगणक ऑपरेटर", "Computer Operator"],
  ["कॉम्प्युटर ऑपरेटर", "Computer Operator"],
]);

function parseDesignation(englishValue, marathiValue) {
  if (englishValue) {
    const normalized = englishValue.trim().toLowerCase();
    const exact = VALID_DESIGNATIONS.find(
      (d) => d.toLowerCase() === normalized
    );
    if (exact) return exact;
  }

  if (marathiValue) {
    const mapped = DESIGNATION_ALIASES_MR.get(
      marathiValue.trim()
    );
    if (mapped) return mapped;
  }

  return "Other";
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

  if (isPlaceholderName(values.gpName)) values.gpName = undefined;
  if (isPlaceholderName(values.gpNameMr)) values.gpNameMr = undefined;
  if (isPlaceholderName(values.personName)) values.personName = undefined;
  if (isPlaceholderName(values.personNameMr)) values.personNameMr = undefined;

  if (!values.gpName && !values.gpNameMr) missing.push("grampanchayat_name or grampanchayat_name_marathi");
  if (!values.taluka && !values.talukaMr) missing.push("taluka or taluka_marathi");
  if (!values.district && !values.districtMr) missing.push("district or district_marathi");

  return { values, missing };
}

// POST /api/import - multipart/form-data, field name "file"
const importSpreadsheet = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // .xlsx/.xls are Unicode already. For CSV/TSV we detect the real encoding
  // ourselves - SheetJS would otherwise read a UTF-8 file without a BOM as
  // Windows-1252 and silently turn every Marathi value into junk.
  const warnings = [];
  let workbook;
  let encoding = "xlsx";
  if (isXlsxOrXls(req.file.buffer)) {
    workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
  } else {
    const decoded = decodeTextFile(req.file.buffer);
    encoding = decoded.encoding;
    if (decoded.unsure) {
      warnings.push(
        "This file is not saved as UTF-8, so any Marathi text in it may already have been lost (it appears as '?'). " +
          "In Excel use Save As \u2192 \"CSV UTF-8 (Comma delimited)\", or upload the .xlsx file instead."
      );
    }
    workbook = XLSX.read(decoded.text, { type: "string", cellDates: true });
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  // fixRow also repairs text that was already garbled inside the file itself.
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map(fixRow);

  // Excel's legacy "CSV (Comma delimited)" replaces every Devanagari letter with "?"
  // while saving. Nothing can recover that, so say so instead of importing "????".
  const questionRows = rows.filter((r) => Object.values(r).some((v) => typeof v === "string" && /^\?{2,}$/.test(v.trim())));
  if (questionRows.length) {
    warnings.push(
      `${questionRows.length} row(s) contain Marathi that was already replaced by "?" when the file was saved. ` +
        "Those values cannot be recovered - re-export the original sheet as \"CSV UTF-8\" (or .xlsx) and import again."
    );
  }

  if (warnings.length === 0 && rows.some((r) => Object.values(r).some((v) => typeof v === "string" && v.includes("\uFFFD")))) {
    warnings.push("Some cells contain unreadable characters (\uFFFD). Re-save the file as UTF-8 or .xlsx and import again.");
  }

  const results = [];
  let gramPanchayatsCreated = 0;
  let gramPanchayatsMatched = 0;
  let personsCreated = 0;
  let personsMatched = 0;
  let assignmentsCreated = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
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
        taluka: f.taluka || f.talukaMr,
        talukaMr: f.talukaMr,
        district: f.district || f.districtMr,
        districtMr: f.districtMr,
        population: getField(row, "population")
          ? Number(getField(row, "population"))
          : undefined,
        numberOfHouseholds: getField(row, "number_of_households", "households")
          ? Number(getField(row, "number_of_households", "households"))
          : undefined,
        isUsingOurSoftware: parseBoolean(
          getField(row, "is_using_software", "using_software")
        ),
        previousSoftwareUsed: getField(
          row,
          "previous_software",
          "previous_software_used"
        ),
        softwareStartDate: getField(row, "software_start_date")
          ? new Date(getField(row, "software_start_date"))
          : undefined,
        personName: f.personName,
        personNameMr: f.personNameMr,
        designation:
          f.personName || f.personNameMr
            ? parseDesignation(f.designation, f.designationMr)
            : undefined,
        designationMr: f.designationMr,
        phone: f.phone,
        email: getField(row, "email"),
        replaceExistingHolder: true,
        changedBy: req.user?.id,
      });

      result.gramPanchayatWasNew
        ? gramPanchayatsCreated++
        : gramPanchayatsMatched++;

      if (result.personId) {
        result.personWasNew
          ? personsCreated++
          : personsMatched++;
      }

      if (result.assignmentWasNew) {
        assignmentsCreated++;
      }

      results.push({
        row: rowNum,
        gramPanchayat: result.gramPanchayatWasNew ? "created" : "matched",
        person: result.personId
          ? result.personWasNew
            ? "created"
            : "matched"
          : "skipped",
        assignment: result.personId
          ? result.assignmentWasNew
            ? result.assignmentWasReplacement
              ? "replaced"
              : "created"
            : "already_current"
          : "skipped",
      });
    } catch (err) {
      results.push({
        row: rowNum,
        gramPanchayat: "skipped",
        person: "skipped",
        assignment: "skipped",
        error: err.message ?? "Unknown error",
      });
    }
  }

  const summary = {
    gramPanchayatsCreated,
    gramPanchayatsMatched,
    personsCreated,
    personsMatched,
    assignmentsCreated,
  };

  emitToAdmins("import:completed", {
    totalRows: rows.length,
    summary,
  });

  return res.json({
    totalRows: rows.length,
    summary,
    rows: results,
    encoding,
    warnings,
  });
});

module.exports = { importSpreadsheet };