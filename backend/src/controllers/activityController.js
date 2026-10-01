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
  const { type, gramPanchayatId, personId, notes, clientInterest, problemSolved, durationMinutes, nextFollowUpDate, customFields } = req.body;

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
  if (validType.requireContact && !personId) {
    return res.status(400).json({ error: "Contact is required for this activity type" });
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

function csvEscape(value) {
  const str = value === undefined || value === null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

// GET /api/activities/export - admin only, streams a CSV
const exportActivities = asyncHandler(async (req, res) => {
  const { q, type, designation, from, to, employeeId } = req.query;
  const filter = {};

  if (employeeId) filter.employeeId = employeeId;

  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    const [gps, persons, users] = await Promise.all([
      GramPanchayat.find({ name: regex }).select("_id"),
      Person.find({ name: regex }).select("_id"),
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
  // rather than a page size, just as a guard against an unbounded query
  // accidentally pulling the entire collection into memory at once.
  const entries = await ActivityLog.find(filter)
    .sort({ date: -1 })
    .limit(20000)
    .populate("employeeId", "name")
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr")
    .populate("personId", "name designation phone");

  // Dynamic columns: every Admin-configured Activity field (global + all
  // Activity Types), active or not, so an export still shows the answer
  // for a field that's since been disabled (see requirements #18/#33 -
  // exported columns must follow config, not a hard-coded list).
  const dynamicFieldDefs = await FormFieldConfig.find({ target: "activity" }).sort({ order: 1 });
  // clientInterest/problemSolved/durationMinutes/nextFollowUpDate are kept
  // as their own legacy columns below for continuity, so don't duplicate
  // them again just because an admin also defined a config field with that key.
  const extraFieldDefs = dynamicFieldDefs.filter((f) => !LEGACY_MIRRORED_KEYS.includes(f.key));

  const header = [
    "date", "logged_at", "employee", "type", "grampanchayat", "taluka", "district",
    "contact_name", "contact_designation", "contact_phone",
    "client_interest", "problem_solved", "duration_minutes", "next_follow_up", "notes",
    ...extraFieldDefs.map((f) => f.label),
  ];

  const rows = entries.map((e) =>
    [
      new Date(e.date).toISOString().slice(0, 10),
      e.createdAt ? new Date(e.createdAt).toISOString() : "",
      e.employeeId?.name,
      e.type,
      e.gramPanchayatId?.name,
      e.gramPanchayatId?.taluka,
      e.gramPanchayatId?.district,
      e.personId?.name,
      e.personId?.designation,
      e.personId?.phone,
      e.clientInterest,
      e.problemSolved,
      e.durationMinutes,
      e.nextFollowUpDate ? new Date(e.nextFollowUpDate).toISOString().slice(0, 10) : "",
      e.notes,
      ...extraFieldDefs.map((f) => {
        const v = e.customFields?.[f.key];
        return Array.isArray(v) ? v.join("; ") : v;
      }),
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  return sendCsv(res, `gramsoft-activity-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

module.exports = { createActivity, listActivities, exportActivities };
