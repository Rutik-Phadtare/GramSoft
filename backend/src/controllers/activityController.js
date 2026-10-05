const ActivityLog = require("../models/ActivityLog");
const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const User = require("../models/User");
const ActivityTypeConfig = require("../models/ActivityTypeConfig");
const FormFieldConfig = require("../models/FormFieldConfig");
const { escapeRegex } = require("../utils/normalize");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins, emitToUser } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { validateDynamicFieldValues } = require("../utils/dynamicFields");
const { createAdminNotification } = require("./notificationController");
const { sendCsv } = require("../utils/sendCsv");
const mongoose = require("mongoose");
const ChangeRequest = require("../models/ChangeRequest");
const ChangeHistory = require("../models/ChangeHistory");
const { buildNameSearchClauses } = require("../utils/bilingual");
const {
  PERSON_PROPOSAL_FIELDS, loadLinkedProposals, deriveNewContactProposal, buildActivityTable, tableToCsv,
} = require("../utils/activityDetails");

// No update/edit endpoint exists on purpose - activity entries are
// append-only. A correction is a new entry, not an edit to an old one.

// These three columns predate the Admin Form Builder and used to be shown
// based on a hard-coded regex against the activity type key (see the old
// ActivityNew.jsx isSupportType/isOutreachType helpers). They're kept as
// real schema columns so old data and existing CSV export filters keep
// working, but they are no longer required or type-specific in code - the
// Admin now controls whether/where they appear by creating a
// FormFieldConfig field with a matching key ("problemSolved" /
// "clientInterest") scoped to whichever Activity Type(s) they choose. When
// a dynamic submission includes one of these keys, we mirror it into the
// dedicated column too so nothing downstream (CSV export, admin explorer
// filters) has to change.
const LEGACY_MIRRORED_KEYS = ["clientInterest", "problemSolved", "durationMinutes", "nextFollowUpDate"];

// POST /api/activities
const createActivity = asyncHandler(async (req, res) => {
  const { type, gramPanchayatId, personId, notes, clientInterest, problemSolved, durationMinutes, nextFollowUpDate, customFields, newContactProposal } = req.body;

  if (!type || !notes) {
    return res.status(400).json({ error: "type and notes are required" });
  }

  const validType = await ActivityTypeConfig.findOne({ key: type, active: true });
  if (!validType) {
    return res.status(400).json({ error: "Unknown or inactive activity type" });
  }

  // Gram Panchayat / Contact are structural relationships, not dynamic
  // fields, so their required/shown rules live on the Activity Type itself
  // (see ActivityTypeConfig) rather than in FormFieldConfig. Enforced here
  // - client-side hiding is a UX nicety, not the actual guarantee.
  if (validType.requireGramPanchayat && !gramPanchayatId) {
    return res.status(400).json({ error: "Gram Panchayat is required for this activity type" });
  }
  // A "new contact proposal" (the employee describing someone who isn't in
  // the directory yet) satisfies a required Contact just as well as picking
  // an existing one. The proposal itself is queued for admin approval via
  // POST /api/change-requests (sent by the client right after this call);
  // here we only validate that a usable one was supplied.
  const hasProposalPayload = newContactProposal && typeof newContactProposal === "object";
  if (hasProposalPayload && !personId) {
    const name = String(newContactProposal.name || "").trim();
    const designation = String(newContactProposal.designation || "").trim();
    if (!name || !Person.DESIGNATIONS.includes(designation)) {
      return res.status(400).json({ error: "A new contact proposal needs a name and a valid designation" });
    }
    if (req.user.role !== "admin" && req.user.permissions?.editContacts === false) {
      return res.status(403).json({ error: "You don't have permission to submit this type of proposal" });
    }
  }
  // A proposal is tied to the Grampanchayat it was met at, so it only counts
  // when one was supplied.
  const hasValidNewContactProposal = Boolean(hasProposalPayload && !personId && gramPanchayatId);
  if (validType.requireContact && !personId && !hasValidNewContactProposal) {
    return res.status(400).json({ error: "Select an existing contact or propose a new contact for this activity type" });
  }
  // If this type doesn't show Gram Panchayat, Contact can't be shown either
  // (it's scoped by GP) - so neither should be recorded even if somehow
  // submitted, to avoid a relationship existing that the UI never let the
  // employee see or intend.
  const effectiveGramPanchayatId = validType.showGramPanchayat ? gramPanchayatId : undefined;
  const effectivePersonId = validType.showGramPanchayat && validType.showContact ? personId : undefined;

  // Validate the admin-configured dynamic fields for this specific Activity
  // Type (global fields + fields scoped to `type`) against what was
  // actually submitted. Client-side validation is a UX nicety only - this
  // is what actually enforces "required", option lists, and value types.
  const fieldDefs = await FormFieldConfig.find({
    target: "activity",
    active: true,
    activityTypeKey: { $in: [null, type] },
  });
  const { errors, values: validatedCustomFields } = validateDynamicFieldValues(fieldDefs, customFields);
  if (errors.length) {
    return res.status(400).json({ error: errors.join("; ") });
  }

  // Keep what the employee typed about the new contact on the activity too
  // (whitelisted + trimmed, same fields the proposal itself accepts).
  let newContactSnapshot;
  if (hasValidNewContactProposal) {
    newContactSnapshot = {};
    for (const key of PERSON_PROPOSAL_FIELDS) {
      const v = newContactProposal[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") newContactSnapshot[key] = String(v).trim();
    }
  }

  let designationSnapshot;
  if (effectivePersonId) {
    const person = await Person.findById(effectivePersonId).select("designation");
    designationSnapshot = person?.designation;
  }

  // Legacy top-level params (from older/simpler callers) still work; a
  // value arriving inside validated customFields under the same key takes
  // precedence since that's the config-driven path going forward.
  const mergedClientInterest = validatedCustomFields.clientInterest ?? clientInterest ?? undefined;
  const mergedProblemSolved = validatedCustomFields.problemSolved ?? problemSolved ?? undefined;
  const mergedDuration =
    validatedCustomFields.durationMinutes ??
    (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== "" ? Number(durationMinutes) : undefined);
  const mergedFollowUp = validatedCustomFields.nextFollowUpDate ?? (nextFollowUpDate ? new Date(nextFollowUpDate) : undefined);

  const entry = await ActivityLog.create({
    employeeId: req.user.id,
    date: new Date(), // always today, server-side - never trust a client date
    type,
    gramPanchayatId: effectiveGramPanchayatId || undefined,
    personId: effectivePersonId || undefined,
    designationSnapshot,
    notes,
    clientInterest: mergedClientInterest,
    problemSolved: mergedProblemSolved,
    durationMinutes: mergedDuration,
    nextFollowUpDate: mergedFollowUp,
    // Keep the full validated dynamic bag too (including the legacy-mirrored
    // keys) so a field that's been renamed away from these four legacy
    // columns in the future still has its value preserved somewhere.
    customFields: Object.keys(validatedCustomFields).length ? validatedCustomFields : undefined,
    newContactProposal: newContactSnapshot && Object.keys(newContactSnapshot).length ? newContactSnapshot : undefined,
  });

  // Keep "last contacted" current on both sides without needing an
  // aggregation query every time the admin explorer loads.
  const touchedAt = entry.date;
  if (effectiveGramPanchayatId) {
    await GramPanchayat.findByIdAndUpdate(effectiveGramPanchayatId, { lastContactedAt: touchedAt });
  }
  if (effectivePersonId) {
    await Person.findByIdAndUpdate(effectivePersonId, { lastContactedAt: touchedAt });
  }

  const populated = await entry.populate([
    { path: "employeeId", select: "name" },
    { path: "gramPanchayatId", select: "name taluka" },
    { path: "personId", select: "name designation" },
  ]);

  // Push to the org-wide live feed (admins) and back to the employee's own
  // dashboard so both update instantly, no polling needed.
  emitToAdmins("activity:new", populated);
  if (req.user.role !== "admin") {
    await createAdminNotification({
      type: "activity",
      section: "dashboard",
      title: "New employee activity",
      message: `${populated.employeeId?.name || "An employee"} logged ${type}${populated.gramPanchayatId?.name ? ` at ${populated.gramPanchayatId.name}` : ""}.`,
      link: "/admin/explorer",
      sourceId: entry._id,
    });
  }
  emitToUser(req.user.id, "activity:new", populated);

  return res.status(201).json({ entry });
});

// GET /api/activities?employeeId=&gramPanchayatId=&personId=&type=&from=&to=&page=&limit=
const listActivities = asyncHandler(async (req, res) => {
  const { employeeId, gramPanchayatId, personId, type, from, to } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });

  const isAdmin = req.user.role === "admin";
  const filter = {};

  // Employees only ever see their own entries here; the admin explorer can
  // filter across everyone.
  filter.employeeId = isAdmin ? employeeId || undefined : req.user.id;
  if (gramPanchayatId) filter.gramPanchayatId = gramPanchayatId;
  if (personId) filter.personId = personId;
  if (type) filter.type = type;
  if (from || to) {
    filter.date = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    };
  }
  Object.keys(filter).forEach((k) => filter[k] === undefined && delete filter[k]);

  const [entries, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employeeId", "name")
      .populate("gramPanchayatId", "name nameMr taluka talukaMr")
      .populate("personId", "name designation"),
    ActivityLog.countDocuments(filter),
  ]);

  return res.json({ entries, pagination: buildPaginationMeta(page, limit, total) });
});

// Shared by the list export and the single-record export.
async function exportContext(entries) {
  // Every Admin-configured Activity field (global + all Activity Types),
  // active or not, so an export still shows the answer for a field that's
  // since been disabled - exported columns follow config, not a hard-coded list.
  const [fieldDefs, proposalsByActivity] = await Promise.all([
    FormFieldConfig.find({ target: "activity" }).sort({ order: 1 }).lean(),
    loadLinkedProposals(entries.map((e) => e._id)),
  ]);
  return { fieldDefs, legacyKeys: LEGACY_MIRRORED_KEYS, proposalsByActivity };
}

const EXPORT_POPULATE = [
  { path: "employeeId", select: "name email team" },
  { path: "gramPanchayatId", select: "name nameMr taluka talukaMr district districtMr" },
  { path: "personId", select: "name nameMr designation phone email address" },
];

// GET /api/activities/export - admin only, streams a CSV
const exportActivities = asyncHandler(async (req, res) => {
  const { q, type, designation, from, to, employeeId } = req.query;
  const filter = {};

  if (employeeId) filter.employeeId = employeeId;

  if (q) {
    // Same bilingual matching the Explorer search uses, so the export
    // contains exactly the rows the admin is looking at.
    const nameClauses = buildNameSearchClauses(q);
    const regex = { $regex: escapeRegex(q), $options: "i" };
    const [gps, persons, users] = await Promise.all([
      nameClauses ? GramPanchayat.find({ $or: nameClauses }).select("_id").limit(2000).lean() : [],
      nameClauses ? Person.find({ $or: nameClauses }).select("_id").limit(2000).lean() : [],
      User.find({ name: regex }).select("_id"),
    ]);
    filter.$or = [
      { gramPanchayatId: { $in: gps.map((g) => g._id) } },
      { personId: { $in: persons.map((p) => p._id) } },
      { employeeId: { $in: users.map((u) => u._id) } },
    ];
  }
  if (type) filter.type = type;
  if (designation) filter.designationSnapshot = designation;
  if (from || to) {
    filter.date = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
  }

  // Unlike the paginated views, an export is meant to capture everything
  // matching the filters in one go - so this caps at a generous ceiling
  // rather than a page size, just as a guard against an unbounded query.
  const entries = await ActivityLog.find(filter).sort({ date: -1 }).limit(20000).populate(EXPORT_POPULATE).lean();
  const table = buildActivityTable(entries, await exportContext(entries));

  return sendCsv(res, `gramsoft-activity-${new Date().toISOString().slice(0, 10)}.csv`, tableToCsv(table));
});

// GET /api/activities/:id/export - admin only - one activity, as a
// Field / Value CSV (same columns as the list export, one per row).
const exportActivity = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid activity id" });
  const entry = await ActivityLog.findById(req.params.id).populate(EXPORT_POPULATE).lean();
  if (!entry) return res.status(404).json({ error: "Activity not found" });

  const { header, rows } = buildActivityTable([entry], await exportContext([entry]));
  const csv = tableToCsv({ header: ["field", "value"], rows: header.map((h, i) => [h, rows[0][i]]) });
  return sendCsv(res, `gramsoft-activity-${String(entry._id)}.csv`, csv);
});

// GET /api/activities/:id - admin only - the complete record: everything
// stored on the activity (including any fields not in the current schema),
// the full contact / Grampanchayat / employee, the contact the employee
// proposed, every linked proposal, and the audit history of what it touched.
const getActivityDetail = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid activity id" });

  const entry = await ActivityLog.findById(req.params.id)
    .populate("employeeId", "name email phone role team active")
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr mukamPost pincode officePhone officeEmail")
    .populate("personId", "name nameMr designation designationMr phone email address addressMr district notes previousPhones")
    .lean();
  if (!entry) return res.status(404).json({ error: "Activity not found" });

  const personId = entry.personId?._id;
  const gpId = entry.gramPanchayatId?._id;

  const [linkedMap, fieldDefs] = await Promise.all([
    loadLinkedProposals([entry._id]),
    FormFieldConfig.find({ target: "activity" }).select("key label type").lean(),
  ]);
  const linked = linkedMap.get(String(entry._id)) || [];

  // Other proposals touching the same contact / Grampanchayat that were not
  // raised from this activity - shown separately as related context.
  const linkedIds = linked.map((p) => p._id);
  const relatedOr = [
    ...(personId ? [{ entityType: "Person", entityId: personId }] : []),
    ...(gpId ? [{ gramPanchayatId: gpId, action: { $exists: true, $ne: null } }, { entityType: "GramPanchayat", entityId: gpId }] : []),
  ];
  const related = relatedOr.length
    ? await ChangeRequest.find({ _id: { $nin: linkedIds }, $or: relatedOr })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("proposedBy", "name")
        .populate("reviewedBy", "name")
        .populate("gramPanchayatId", "name nameMr taluka talukaMr")
        .lean()
    : [];

  // Audit trail: for the existing contact, any contact a linked proposal
  // created/changed (approval stamps entityId onto new-contact requests), and
  // the Grampanchayat.
  const personIds = [...new Set([personId, ...linked.filter((p) => p.entityType === "Person").map((p) => p.entityId)].filter(Boolean).map(String))];
  const historyOr = [
    ...(personIds.length ? [{ entityType: "Person", entityId: { $in: personIds } }] : []),
    ...(gpId ? [{ entityType: "GramPanchayat", entityId: gpId }] : []),
  ];
  const history = historyOr.length
    ? await ChangeHistory.find({ $or: historyOr }).sort({ createdAt: -1 }).limit(100).populate("changedBy", "name").lean()
    : [];

  return res.json({
    entry,
    newContactProposal: deriveNewContactProposal(entry, linked),
    customFieldDefs: fieldDefs,
    proposals: [
      ...linked.map((p) => ({ ...p, linkedToActivity: true })),
      ...related.map((p) => ({ ...p, linkedToActivity: false })),
    ],
    history,
  });
});

module.exports = { createActivity, listActivities, exportActivities, exportActivity, getActivityDetail };
