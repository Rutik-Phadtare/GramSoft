const XLSX = require("xlsx");
const { upsertGramPanchayatAndPerson } = require("../utils/upsertGramPanchayatAndPerson");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");

// Expected columns in the uploaded sheet (header names are matched
// case-insensitively, spaces/underscores interchangeable):
//   grampanchayat_name, taluka, district, is_using_software,
//   previous_software, software_start_date, person_name, designation,
//   phone, email
//
// One row = one Grampanchayat + one contact person at it. Dedupe logic
// lives in utils/upsertGramPanchayatAndPerson.js, shared with the
// feedback-form merge flow.

const VALID_DESIGNATIONS = ["Talathi", "Gramsevak", "Sarpanch", "Sachiv", "Computer Operator", "Other"];

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
      const gpName = getField(row, "grampanchayat_name", "grampanchayat", "gp_name", "village");
      if (!gpName) {
        results.push({ row: rowNum, gramPanchayat: "skipped", person: "skipped", assignment: "skipped", error: "Missing grampanchayat_name" });
        continue;
      }

      const result = await upsertGramPanchayatAndPerson({
        gramPanchayatName: gpName,
        taluka: getField(row, "taluka"),
        district: getField(row, "district"),
        population: getField(row, "population") ? Number(getField(row, "population")) : undefined,
        numberOfHouseholds: getField(row, "number_of_households", "households")
          ? Number(getField(row, "number_of_households", "households"))
          : undefined,
        isUsingOurSoftware: parseBoolean(getField(row, "is_using_software", "using_software")),
        previousSoftwareUsed: getField(row, "previous_software", "previous_software_used"),
        softwareStartDate: getField(row, "software_start_date") ? new Date(getField(row, "software_start_date")) : undefined,
        personName: getField(row, "person_name", "contact_name", "talathi_name"),
        designation: parseDesignation(getField(row, "designation", "role")),
        phone: getField(row, "phone", "mobile", "contact_number"),
        email: getField(row, "email"),
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
        assignment: result.personId ? (result.assignmentWasNew ? "created" : "already_current") : "skipped",
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
