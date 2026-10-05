// Shared by the Admin activity detail endpoint and the CSV exports, so what
// Admin sees on screen and what they download come from the same logic.
//
// Nothing here creates new data - it only gathers what the employee-side
// flows already stored (ActivityLog, ChangeRequest, ChangeHistory) and
// flattens it into readable values.

const ChangeRequest = require("../models/ChangeRequest");

const PERSON_PROPOSAL_FIELDS = ["name", "nameMr", "designation", "designationMr", "phone", "email", "address", "addressMr", "district", "notes"];

// Keys that are only database ids used to wire proposals together. The
// human-readable equivalent (e.g. the workplace / contact label) is always
// stored next to them, so they're left out of readable text.
const HIDDEN_KEYS = new Set(["gramPanchayatId", "replacesPersonId"]);

function isObjectId(v) {
  return v && typeof v === "object" && v._bsontype === "ObjectId";
}

// Turns any stored value into readable text - never "[object Object]".
function flattenValue(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (isObjectId(value)) return String(value);
  if (Array.isArray(value)) return value.map(flattenValue).filter((v) => v !== "").join("; ");
  if (typeof value === "object") {
    const plain = typeof value.toObject === "function" ? value.toObject() : value;
    return Object.entries(plain)
      .filter(([k]) => !HIDDEN_KEYS.has(k))
      .map(([k, v]) => [k, flattenValue(v)])
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function proposalTypeLabel(cr) {
  if (cr.action === "change_workplace") return "Workplace change";
  if (cr.action === "replace_contact") return "Contact replacement";
  if (cr.entityType === "General") return "General suggestion";
  if (cr.entityType === "GramPanchayat") return cr.isNewEntity ? "New Grampanchayat" : "Grampanchayat update";
  return cr.isNewEntity ? "New contact" : "Contact update";
}

// Proposals queued by the employee flows that point at this activity
// (relatedActivityLogId). Returned as a Map keyed by activity id.
async function loadLinkedProposals(activityIds) {
  const requests = await ChangeRequest.find({ relatedActivityLogId: { $in: activityIds } })
    .sort({ createdAt: 1 })
    .populate("proposedBy", "name email")
    .populate("reviewedBy", "name")
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr")
    .lean();
  const byActivity = new Map();
  for (const cr of requests) {
    const key = String(cr.relatedActivityLogId);
    if (!byActivity.has(key)) byActivity.set(key, []);
    byActivity.get(key).push(cr);
  }
  return byActivity;
}

// The full contact the employee proposed while logging this activity.
// Prefers the snapshot stored on the activity itself; falls back to the
// linked new-contact proposal (older records, or when only the proposal was
// saved). Returns null when no new contact was proposed.
function deriveNewContactProposal(entry, linkedProposals = []) {
  if (entry.newContactProposal && typeof entry.newContactProposal === "object") return entry.newContactProposal;
  const cr = linkedProposals.find((p) => p.entityType === "Person" && p.isNewEntity && !p.action);
  return cr?.proposedChanges || null;
}

// ---- CSV ---------------------------------------------------------------

function csvEscape(value) {
  const str = value === undefined || value === null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

const iso = (d) => (d ? new Date(d).toISOString() : "");
const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const joinProposals = (proposals, fn) => proposals.map(fn).filter((v) => v !== "").join(" || ");

// Builds { header, rows } for a list of (populated) activity docs.
// `fieldDefs` = every admin-configured activity field (active or not).
// `legacyKeys` = keys that already have their own dedicated column.
function buildActivityTable(entries, { fieldDefs, legacyKeys, proposalsByActivity }) {
  const extraFieldDefs = fieldDefs.filter((f) => !legacyKeys.includes(f.key));
  const configuredKeys = new Set(fieldDefs.map((f) => f.key));

  const header = [
    "activity_id", "date", "logged_at", "employee", "employee_email", "employee_team", "type",
    "grampanchayat", "grampanchayat_marathi", "taluka", "district",
    "contact_name", "contact_name_marathi", "contact_designation", "contact_phone", "contact_email", "contact_address",
    "contact_source",
    "client_interest", "problem_solved", "duration_minutes", "next_follow_up", "notes",
    "new_contact_name", "new_contact_name_marathi", "new_contact_designation", "new_contact_phone",
    "new_contact_email", "new_contact_address", "new_contact_district", "new_contact_notes",
    "proposal_count", "proposal_type", "proposal_status", "proposed_by", "proposed_at", "proposal_reason",
    "proposal_previous_values", "proposal_new_values", "reviewed_by", "reviewed_at", "review_note",
    ...extraFieldDefs.map((f) => f.label),
    "other_custom_fields",
  ];

  const rows = entries.map((e) => {
    const proposals = proposalsByActivity.get(String(e._id)) || [];
    const np = deriveNewContactProposal(e, proposals) || {};
    const cf = e.customFields && typeof e.customFields === "object" ? e.customFields : {};
    const otherCustom = Object.entries(cf)
      .filter(([k]) => !configuredKeys.has(k) && !legacyKeys.includes(k))
      .map(([k, v]) => `${k}: ${flattenValue(v)}`)
      .join("; ");

    return [
      String(e._id), isoDate(e.date), iso(e.createdAt),
      e.employeeId?.name, e.employeeId?.email, e.employeeId?.team, e.type,
      e.gramPanchayatId?.name, e.gramPanchayatId?.nameMr, e.gramPanchayatId?.taluka, e.gramPanchayatId?.district,
      e.personId?.name, e.personId?.nameMr, e.personId?.designation || e.designationSnapshot, e.personId?.phone,
      e.personId?.email, e.personId?.address,
      e.personId ? "Existing contact" : Object.keys(np).length ? "New contact proposed" : "",
      e.clientInterest, e.problemSolved, e.durationMinutes, isoDate(e.nextFollowUpDate), e.notes,
      np.name, np.nameMr, np.designation, np.phone, np.email, np.address, np.district, np.notes,
      proposals.length || "",
      joinProposals(proposals, proposalTypeLabel),
      joinProposals(proposals, (p) => p.status),
      joinProposals(proposals, (p) => p.proposedBy?.name || ""),
      joinProposals(proposals, (p) => iso(p.createdAt)),
      joinProposals(proposals, (p) => p.reason || ""),
      joinProposals(proposals, (p) => flattenValue(p.previousValues)),
      joinProposals(proposals, (p) => flattenValue(p.proposedChanges)),
      joinProposals(proposals, (p) => p.reviewedBy?.name || ""),
      joinProposals(proposals, (p) => iso(p.reviewedAt)),
      joinProposals(proposals, (p) => p.reviewNote || ""),
      ...extraFieldDefs.map((f) => flattenValue(cf[f.key])),
      otherCustom,
    ].map(flattenValue);
  });

  return { header, rows };
}

const tableToCsv = ({ header, rows }) =>
  [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");

module.exports = {
  PERSON_PROPOSAL_FIELDS,
  flattenValue,
  proposalTypeLabel,
  loadLinkedProposals,
  deriveNewContactProposal,
  buildActivityTable,
  tableToCsv,
  csvEscape,
};
