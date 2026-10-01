const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const ActivityLog = require("../models/ActivityLog");
const ChangeHistory = require("../models/ChangeHistory");
const { normalizeName, normalizePhone, escapeRegex } = require("../utils/normalize");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { logFieldChanges } = require("../utils/diffFields");
const { findHolderConflict, replaceHolder } = require("../utils/singleHolderGuard");
const { buildNameSearchClauses, deriveGp } = require("../utils/bilingual");
const { keyFromParam, getGeoOptions, invalidateGeoOptionsCache } = require("../utils/geo");
const { sendCsv } = require("../utils/sendCsv");

// List rows never need the heavy per-GP rate tables or index arrays.
const LIST_EXCLUDE = "-taxRates -constructionRates -landRates -customFields -searchKeys -identityKeys";

// Kept in one place so "active" always means the same thing everywhere a
// Grampanchayat's software status is read or filtered on.
function computeSoftwareUsageStatus(isUsingOurSoftware, softwareStartDate) {
  if (isUsingOurSoftware) return "active";
  if (softwareStartDate) return "churned"; // was a customer, isn't now
  return "never_used";
}

// Fields an admin can hide from an employee whose "view financials"
// permission has been switched off - the contract/pricing side of a
// Grampanchayat's record, not its basic identity/contact info.
const FINANCIAL_FIELDS = [
  "subscriptionEndDate", "subscriptionYears", "priceAmount", "paymentMode",
  "taxRates", "constructionRates", "landRates",
];

function canViewFinancials(user) {
  if (!user || user.role === "admin") return true;
  return (user.permissions || {}).viewFinancials !== false;
}

function stripFinancials(doc) {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  for (const field of FINANCIAL_FIELDS) delete plain[field];
  return plain;
}

function listSelect(user) {
  return canViewFinancials(user) ? LIST_EXCLUDE : `${LIST_EXCLUDE} ${FINANCIAL_FIELDS.map((f) => `-${f}`).join(" ")}`;
}

// Shared by list and CSV export so both always filter identically.
// `district` / `taluka` accept a key from the filter dropdown or free text in
// English or Marathi - all resolve to the same language-independent key.
function buildGpFilter(query) {
  const { q, taluka, district, softwareUsageStatus } = query;
  const filter = {};
  const search = buildNameSearchClauses(q);
  if (search) filter.$or = search;
  const districtKey = keyFromParam("district", district);
  const talukaKey = keyFromParam("taluka", taluka);
  if (districtKey) filter.districtKey = districtKey;
  if (talukaKey) filter.talukaKey = talukaKey;
  if (softwareUsageStatus) filter.softwareUsageStatus = softwareUsageStatus;
  return filter;
}

// `_id` is always the final tiebreaker so pagination is stable - otherwise rows
// with equal sort values (e.g. thousands of never-contacted GPs) can repeat or vanish between pages.
function buildGpSortStage(sort) {
  switch (sort) {
    case "name_asc":
      return { nameKey: 1, _id: 1 };
    case "name_desc":
      return { nameKey: -1, _id: -1 };
    case "newest":
      return { createdAt: -1, _id: -1 };
    case "oldest":
      return { createdAt: 1, _id: 1 };
    case "population_desc":
      return { population: -1, _id: 1 };
    case "population_asc":
      return { population: 1, _id: 1 };
    default:
      return { lastContactedAt: -1, nameKey: 1, _id: 1 };
  }
}

// GET /api/grampanchayats?q=&taluka=&district=&softwareUsageStatus=&sort=&page=&limit=
const listGramPanchayats = asyncHandler(async (req, res) => {
  const { sort } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const filter = buildGpFilter(req.query);

  const [results, total] = await Promise.all([
    GramPanchayat.find(filter).select(listSelect(req.user)).sort(buildGpSortStage(sort)).skip(skip).limit(limit).lean(),
    GramPanchayat.countDocuments(filter),
  ]);

  return res.json({ results, pagination: buildPaginationMeta(page, limit, total) });
});

// GET /api/grampanchayats/filter-options?district=
// One entry per real place as { key, en, mr, label, count } carrying BOTH
// language labels: the UI shows the label for the selected language while the
// filter value (`key`) stays the same when the language is switched.
// Talukas cascade from the selected district.
const getFilterOptions = asyncHandler(async (req, res) => {
  const data = await getGeoOptions(req.query.district);
  res.set("Cache-Control", "private, max-age=30");
  return res.json(data);
});

// GET /api/grampanchayats/rate-defaults - the standard bilingual rate-table
// categories from the client's paper registration form, used both by the
// public registration form and by "add rate row" pickers in the admin UI.
const getRateDefaults = asyncHandler(async (req, res) => {
  return res.json({
    taxRates: GramPanchayat.DEFAULT_TAX_RATES,
    constructionRates: GramPanchayat.DEFAULT_CONSTRUCTION_RATES,
    landRates: GramPanchayat.DEFAULT_LAND_RATES,
  });
});

// POST /api/grampanchayats - admin only
const createGramPanchayat = asyncHandler(async (req, res) => {
  const {
    name, nameMr, taluka, talukaMr, district, districtMr, pincode, officePhone, officeEmail, population, numberOfHouseholds,
    mukamPost, gpType, waterSupplyMode, reassessmentYearFrom, reassessmentYearTo,
    isUsingOurSoftware, previousSoftwareUsed, softwareStartDate,
    subscriptionEndDate, subscriptionYears, priceAmount, paymentMode, status,
  } = req.body;

  if ((!name && !nameMr) || (!taluka && !talukaMr) || (!district && !districtMr)) {
    return res.status(400).json({ error: "name, taluka, and district are required (English or Marathi)" });
  }

  const nameKey = normalizeName(name || nameMr);
  // The same GP typed in the other language also counts as a duplicate.
  const probe = deriveGp({ name, nameMr, taluka, talukaMr, district, districtMr });
  const existing = await GramPanchayat.findOne({
    $or: [
      { nameKey, taluka: String(taluka || talukaMr).trim() },
      { districtKey: probe.districtKey, talukaKey: probe.talukaKey, identityKeys: { $in: probe.identityKeys } },
    ],
  });
  if (existing) {
    return res.status(409).json({ error: "A Grampanchayat with this name and taluka already exists" });
  }

  const usingSoftware = Boolean(isUsingOurSoftware);
  const startDate = softwareStartDate ? new Date(softwareStartDate) : undefined;

  const gp = await GramPanchayat.create({
    name,
    nameMr,
    nameKey,
    taluka: String(taluka || talukaMr).trim(),
    talukaMr,
    district: String(district || districtMr).trim(),
    districtMr,
    pincode,
    officePhone,
    officeEmail,
    population: population || undefined,
    numberOfHouseholds: numberOfHouseholds || undefined,
    mukamPost,
    gpType: gpType || undefined,
    waterSupplyMode: waterSupplyMode || undefined,
    reassessmentYearFrom,
    reassessmentYearTo,
    // Every new Grampanchayat starts with the standard rate categories from
    // the client's paper form, values blank until someone fills them in -
    // this is what makes the edit screen show all the expected rows even
    // for a GP added through the plain "Add Grampanchayat" button.
    taxRates: GramPanchayat.DEFAULT_TAX_RATES,
    constructionRates: GramPanchayat.DEFAULT_CONSTRUCTION_RATES,
    landRates: GramPanchayat.DEFAULT_LAND_RATES,
    isUsingOurSoftware: usingSoftware,
    softwareUsageStatus: computeSoftwareUsageStatus(usingSoftware, startDate),
    previousSoftwareUsed,
    softwareStartDate: startDate,
    subscriptionEndDate: subscriptionEndDate ? new Date(subscriptionEndDate) : undefined,
    subscriptionYears: subscriptionYears || undefined,
    priceAmount: priceAmount || undefined,
    paymentMode: paymentMode || undefined,
    status: status || "prospect",
  });

  invalidateGeoOptionsCache();
  emitToAdmins("gramPanchayat:new", gp);
  return res.status(201).json({ gramPanchayat: gp });
});

// GET /api/grampanchayats/:id
const getGramPanchayat = asyncHandler(async (req, res) => {
  const gramPanchayat = await GramPanchayat.findById(req.params.id);
  if (!gramPanchayat) return res.status(404).json({ error: "Not found" });

  const assignments = await PersonAssignment.find({ gramPanchayatId: req.params.id })
    .sort({ fromDate: -1 })
    .populate("personId", "name nameMr designation designationMr phone email");

  const activity = await ActivityLog.find({ gramPanchayatId: req.params.id })
    .sort({ date: -1 })
    .limit(50)
    .populate("employeeId", "name")
    .populate("personId", "name designation");

  return res.json({
    gramPanchayat: canViewFinancials(req.user) ? gramPanchayat : stripFinancials(gramPanchayat),
    currentContacts: assignments.filter((a) => !a.toDate),
    pastContacts: assignments.filter((a) => a.toDate),
    activity,
    lastActivity: activity[0] || null,
  });
});

// GET /api/grampanchayats/:id/history - admin only
const getGramPanchayatHistory = asyncHandler(async (req, res) => {
  const history = await ChangeHistory.find({ entityType: "GramPanchayat", entityId: req.params.id })
    .sort({ createdAt: -1 })
    .populate("changedBy", "name");
  return res.json({ history });
});

// PATCH /api/grampanchayats/:id - admin only
const updateGramPanchayat = asyncHandler(async (req, res) => {
  const allowed = [
    "name", "nameMr", "taluka", "talukaMr", "district", "districtMr", "pincode", "officePhone", "officeEmail",
    "population", "numberOfHouseholds",
    "mukamPost", "gpType", "waterSupplyMode", "reassessmentYearFrom", "reassessmentYearTo",
    "taxRates", "constructionRates", "landRates",
    "isUsingOurSoftware", "previousSoftwareUsed", "softwareStartDate",
    "subscriptionEndDate", "subscriptionYears", "priceAmount", "paymentMode", "status",
    "customFields",
  ];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if ("softwareStartDate" in updates) {
    updates.softwareStartDate = updates.softwareStartDate ? new Date(updates.softwareStartDate) : null;
  }
  if ("subscriptionEndDate" in updates) {
    updates.subscriptionEndDate = updates.subscriptionEndDate ? new Date(updates.subscriptionEndDate) : null;
  }

  const current = await GramPanchayat.findById(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });

  // Recompute from whichever values end up final (existing or just-updated),
  // so this stays correct whether the caller sent one field or all of them.
  const finalUsingSoftware = "isUsingOurSoftware" in updates ? Boolean(updates.isUsingOurSoftware) : current.isUsingOurSoftware;
  const finalStartDate = "softwareStartDate" in updates ? updates.softwareStartDate : current.softwareStartDate;
  updates.softwareUsageStatus = computeSoftwareUsageStatus(finalUsingSoftware, finalStartDate);

  const gramPanchayat = await GramPanchayat.findByIdAndUpdate(req.params.id, updates, { new: true });

  // Rate-table arrays are logged as a single "changed" entry rather than
  // per-row, since diffing array contents field-by-field isn't meaningful
  // for a human reading the history later.
  const { taxRates, constructionRates, landRates, ...scalarUpdates } = updates;
  await logFieldChanges({
    entityType: "GramPanchayat",
    entityId: gramPanchayat._id,
    before: current,
    updates: scalarUpdates,
    changedBy: req.user.id,
  });

  invalidateGeoOptionsCache();
  emitToAdmins("gramPanchayat:updated", gramPanchayat);
  return res.json({ gramPanchayat });
});

// DELETE /api/grampanchayats/:id - admin only
const deleteGramPanchayat = asyncHandler(async (req, res) => {
  await GramPanchayat.findByIdAndDelete(req.params.id);
  await PersonAssignment.deleteMany({ gramPanchayatId: req.params.id });
  // Activity log entries are kept (append-only audit trail) even if the
  // Grampanchayat record itself is removed - they still reference the id.

  invalidateGeoOptionsCache();
  emitToAdmins("gramPanchayat:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

/**
 * Links a contact to this Grampanchayat - either an existing person (found
 * by search) or a brand-new one, created inline. Unlike transferPerson,
 * this never closes the person's other current postings: it's "add another
 * contact here," not "they moved."
 *
 * A Grampanchayat can only have one current Talathi/Sarpanch/Gramsevak/
 * Sachiv/Computer Operator at a time. If someone else already holds that
 * role here, this returns 409 with the conflict details instead of just
 * creating a second one - the frontend shows a confirmation popup, and a
 * follow-up call with `confirmReplace: true` moves the previous holder to
 * "past contacts" (on both this Grampanchayat's profile and their own) and
 * links the new person in their place.
 * POST /api/grampanchayats/:id/contacts - admin only
 */
const addContact = asyncHandler(async (req, res) => {
  const { personId, name, nameMr, designation, designationMr, phone, email, confirmReplace } = req.body;
  const gramPanchayatId = req.params.id;

  const gp = await GramPanchayat.findById(gramPanchayatId);
  if (!gp) return res.status(404).json({ error: "Not found" });

  let person;
  if (personId) {
    person = await Person.findById(personId);
    if (!person) return res.status(404).json({ error: "Contact not found" });
  } else {
    if ((!name && !nameMr) || !designation) {
      return res.status(400).json({ error: "Pick an existing contact, or provide a name and designation to create one" });
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      const existingByPhone = await Person.findOne({ phone: normalizedPhone });
      if (existingByPhone) {
        return res.status(409).json({ error: "A contact with this phone number already exists - search for them instead of creating a new one" });
      }
    }
    person = await Person.create({
      name,
      nameMr,
      nameKey: normalizeName(name || nameMr),
      designation,
      designationMr,
      phone: normalizedPhone,
      email,
      district: gp.district || gp.districtMr,
    });
  }

  const existingOpen = await PersonAssignment.findOne({ personId: person._id, gramPanchayatId, toDate: null });
  if (existingOpen) {
    return res.status(409).json({ error: "This contact is already linked to this Grampanchayat" });
  }

  const conflict = await findHolderConflict({
    gramPanchayatId,
    designation: person.designation,
    excludePersonId: person._id,
  });
  if (conflict && !confirmReplace) {
    return res.status(409).json({
      error: "ALREADY_HAS_HOLDER",
      requiresConfirmation: true,
      conflict: {
        assignmentId: conflict._id,
        person: conflict.personId,
        designation: person.designation,
      },
      message: `${conflict.personId?.name || "Someone"} is already recorded as the ${person.designation} here. Replacing them will move that person to past contacts.`,
    });
  }
  if (conflict && confirmReplace) {
    await replaceHolder({ conflict, gramPanchayatId, designation: person.designation, newPerson: person, changedBy: req.user.id });
  }

  const assignment = await PersonAssignment.create({
    personId: person._id,
    gramPanchayatId,
    designationAtAssignment: person.designation,
    fromDate: new Date(),
    toDate: null,
  });
  await assignment.populate("personId", "name nameMr designation designationMr phone email");

  emitToAdmins("person:transferred", { personId: person._id, assignment });
  if (conflict) emitToAdmins("person:updated", { _id: conflict.personId?._id });
  return res.status(201).json({ assignment, replacedHolder: conflict ? conflict.personId : null });
});

// GET /api/grampanchayats/export?...same filters as listGramPanchayats - admin only
// Bulk-fetches the Grampanchayat directory as CSV, respecting whatever
// filters are currently applied - the read-side counterpart to bulk import.
const exportGramPanchayats = asyncHandler(async (req, res) => {
  const filter = buildGpFilter(req.query);

  const results = await GramPanchayat.find(filter).select("-searchKeys -identityKeys").sort({ nameKey: 1, _id: 1 }).limit(20000).lean();

  const header = [
    "grampanchayat_name", "grampanchayat_name_marathi", "mukam_post", "taluka", "taluka_marathi",
    "district", "district_marathi", "pincode",
    "population", "number_of_households", "office_phone", "office_email", "gp_type", "water_supply_mode",
    "software_status", "software_start_date", "subscription_end_date", "subscription_years", "price_amount", "payment_mode",
  ];
  const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = results.map((gp) =>
    [
      gp.name, gp.nameMr, gp.mukamPost, gp.taluka, gp.talukaMr, gp.district, gp.districtMr, gp.pincode,
      gp.population, gp.numberOfHouseholds, gp.officePhone, gp.officeEmail, gp.gpType, gp.waterSupplyMode,
      gp.softwareUsageStatus, gp.softwareStartDate?.toISOString().slice(0, 10), gp.subscriptionEndDate?.toISOString().slice(0, 10),
      gp.subscriptionYears, gp.priceAmount, gp.paymentMode,
    ].map(csvEscape).join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");

  return sendCsv(res, `gramsoft-grampanchayats-${new Date().toISOString().slice(0, 10)}.csv`, csv);
});

// POST /api/grampanchayats/reindex - admin only. Re-runs the bilingual repair on demand.
const reindexBilingual = asyncHandler(async (req, res) => {
  const { runBilingualBackfill } = require("../seed/backfillBilingualKeys");
  const stats = await runBilingualBackfill({ log: () => {} });
  return res.json({ ok: true, stats });
});

module.exports = {
  reindexBilingual, listGramPanchayats, getFilterOptions, getRateDefaults, exportGramPanchayats, createGramPanchayat, getGramPanchayat,
  getGramPanchayatHistory, updateGramPanchayat, deleteGramPanchayat, addContact,
};
