const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const GramPanchayat = require("../models/GramPanchayat");
const ActivityLog = require("../models/ActivityLog");
const ChangeHistory = require("../models/ChangeHistory");
const mongoose = require("mongoose");
const { normalizeName, normalizePhone, escapeRegex } = require("../utils/normalize");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { logFieldChanges } = require("../utils/diffFields");
const { findHolderConflict, replaceHolder } = require("../utils/singleHolderGuard");

function buildPersonSortStage(sort) {
  switch (sort) {
    case "name_asc":
      return { nameKey: 1 };
    case "name_desc":
      return { nameKey: -1 };
    case "newest":
      return { createdAt: -1 };
    case "oldest":
      return { createdAt: 1 };
    default:
      return { lastContactedAt: -1 };
  }
}

// Attaches posting history (current + past) to a page's worth of person
// docs. Only ever run on the current page (≤100 people), never the full
// matched set, so the extra per-person query is cheap regardless of how
// large the overall directory gets.
async function withPostingHistory(persons) {
  return Promise.all(
    persons.map(async (person) => {
      const assignments = await PersonAssignment.find({ personId: person._id })
        .sort({ fromDate: -1 })
        .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr softwareUsageStatus");
      return {
        ...person,
        totalGramPanchayatsHandled: new Set(assignments.map((a) => a.gramPanchayatId?._id?.toString())).size,
        currentPostings: assignments.filter((a) => !a.toDate),
        pastPostings: assignments.filter((a) => a.toDate),
      };
    })
  );
}

// GET /api/persons?q=&withHistory=&designation=&district=&taluka=&softwareUsageStatus=&gramPanchayatId=&sort=&page=&limit=
//
// `taluka`, `softwareUsageStatus`, and `gramPanchayatId` describe a
// person's *current posting*, not the person record itself - Person has no
// gramPanchayatId of its own (see PersonAssignment) - so those filters
// route through an aggregation that joins through PersonAssignment into
// GramPanchayat. Everything else stays on the fast, simple, indexed find()
// path.
//
// `gramPanchayatId` is what the employee Activity form uses once a
// Grampanchayat is selected, so only contacts actually posted there are
// ever returned - never the whole directory. This is enforced here, not
// just filtered client-side.
const listPersons = asyncHandler(async (req, res) => {
  const { q, designation, district, taluka, softwareUsageStatus, gramPanchayatId, sort } = req.query;
  const withHistory = req.query.withHistory === "true";
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 });
  const sortStage = buildPersonSortStage(sort);

  if (gramPanchayatId && !mongoose.isValidObjectId(gramPanchayatId)) {
    return res.status(400).json({ error: "Invalid gramPanchayatId" });
  }

  const needsPostingJoin = Boolean(taluka || softwareUsageStatus || gramPanchayatId);
  let results;
  let total;

  // Matches on the normalized English key (as before) or the raw Marathi
  // name, prefix-anchored the same way, so searching in Marathi returns the
  // same contacts that searching in English already did.
  const qFilter = q ? { $or: [{ nameKey: { $regex: `^${escapeRegex(normalizeName(q))}`, $options: "i" } }, { nameMr: { $regex: `^${escapeRegex(normalizeName(q))}`, $options: "i" } }] } : {};

  if (!needsPostingJoin) {
    const filter = { ...qFilter };
    if (designation) filter.designation = designation;
    if (district) filter.district = district;

    [results, total] = await Promise.all([
      Person.find(filter).sort(sortStage).skip(skip).limit(limit).lean(),
      Person.countDocuments(filter),
    ]);
  } else {
    const personMatch = { ...qFilter };
    if (designation) personMatch.designation = designation;
    if (district) personMatch.district = district;

    const elemConditions = {};
    if (taluka) elemConditions.taluka = taluka;
    if (softwareUsageStatus) elemConditions.softwareUsageStatus = softwareUsageStatus;
    if (gramPanchayatId) elemConditions._id = new mongoose.Types.ObjectId(gramPanchayatId);
    // $elemMatch (not two separate dotted-path conditions) so that when
    // multiple filters are given, they must all be true of the SAME current
    // posting - otherwise a person with postings at two different GPs could
    // wrongly match on "taluka X" from one and "GP Y" from the other.
    const postingMatch = Object.keys(elemConditions).length
      ? { currentGramPanchayats: { $elemMatch: elemConditions } }
      : {};

    const pipeline = [
      ...(Object.keys(personMatch).length ? [{ $match: personMatch }] : []),
      {
        $lookup: {
          from: PersonAssignment.collection.name,
          let: { personId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$personId", "$$personId"] }, { $eq: ["$toDate", null] }] } } },
          ],
          as: "currentAssignments",
        },
      },
      {
        $lookup: {
          from: GramPanchayat.collection.name,
          localField: "currentAssignments.gramPanchayatId",
          foreignField: "_id",
          as: "currentGramPanchayats",
        },
      },
      ...(Object.keys(postingMatch).length ? [{ $match: postingMatch }] : []),
      { $sort: sortStage },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }, { $project: { currentAssignments: 0, currentGramPanchayats: 0 } }],
          totalCount: [{ $count: "count" }],
        },
      },
    ];

    const [agg] = await Person.aggregate(pipeline);
    results = agg?.data || [];
    total = agg?.totalCount?.[0]?.count || 0;
  }

  const pagination = buildPaginationMeta(page, limit, total);
  if (!withHistory) {
    return res.json({ results, pagination });
  }

  return res.json({ results: await withPostingHistory(results), pagination });
});

// GET /api/persons/filter-options - admin only
const getFilterOptions = asyncHandler(async (req, res) => {
  const districts = await Person.distinct("district");
  return res.json({ districts: districts.filter(Boolean).sort() });
});

// GET /api/persons/export?...same filters as listPersons - admin only
// Bulk-fetches the contact directory as CSV, respecting whatever filters
// are currently applied - the read-side counterpart to bulk import.
const exportPersons = asyncHandler(async (req, res) => {
  const { q, designation, district } = req.query;
  const filter = {};
  if (q) {
    const qRegex = { $regex: `^${escapeRegex(normalizeName(q))}`, $options: "i" };
    filter.$or = [{ nameKey: qRegex }, { nameMr: qRegex }];
  }
  if (designation) filter.designation = designation;
  if (district) filter.district = district;

  const persons = await Person.find(filter).sort({ name: 1 }).limit(20000).lean();
  const personIds = persons.map((p) => p._id);
  const assignments = await PersonAssignment.find({ personId: { $in: personIds }, toDate: null })
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr");

  const currentGpByPerson = new Map();
  for (const a of assignments) {
    if (!currentGpByPerson.has(a.personId.toString())) currentGpByPerson.set(a.personId.toString(), a.gramPanchayatId);
  }

  const header = [
    "name", "name_marathi", "designation", "designation_marathi", "phone", "email",
    "address", "address_marathi", "district", "current_grampanchayat", "current_grampanchayat_marathi",
    "current_taluka", "current_taluka_marathi",
  ];
  const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = persons.map((p) => {
    const gp = currentGpByPerson.get(p._id.toString());
    return [
      p.name, p.nameMr, p.designation, p.designationMr, p.phone, p.email,
      p.address, p.addressMr, p.district, gp?.name, gp?.nameMr, gp?.taluka, gp?.talukaMr,
    ].map(csvEscape).join(",");
  });
  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="gramsoft-contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

// POST /api/persons - admin only
const createPerson = asyncHandler(async (req, res) => {
  const { name, nameMr, designation, designationMr, phone, email, address, addressMr, district, notes } = req.body;
  if (!name || !designation) {
    return res.status(400).json({ error: "name and designation are required" });
  }

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const existing = await Person.findOne({ phone: normalizedPhone });
    if (existing) {
      return res.status(409).json({ error: "A contact with this phone number already exists" });
    }
  }

  const person = await Person.create({
    name,
    nameMr,
    nameKey: normalizeName(name),
    designation,
    designationMr,
    phone: normalizedPhone,
    email,
    address,
    addressMr,
    district,
    notes,
  });

  emitToAdmins("person:new", person);
  return res.status(201).json({ person });
});

// GET /api/persons/:id
const getPerson = asyncHandler(async (req, res) => {
  const person = await Person.findById(req.params.id);
  if (!person) return res.status(404).json({ error: "Not found" });

  const assignments = await PersonAssignment.find({ personId: req.params.id })
    .sort({ fromDate: -1 })
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr softwareUsageStatus");

  const activity = await ActivityLog.find({ personId: req.params.id })
    .sort({ date: -1 })
    .limit(50)
    .populate("employeeId", "name")
    .populate("gramPanchayatId", "name taluka");

  return res.json({
    person,
    currentPostings: assignments.filter((a) => !a.toDate),
    pastPostings: assignments.filter((a) => a.toDate),
    totalGramPanchayatsHandled: new Set(assignments.map((a) => a.gramPanchayatId?._id?.toString())).size,
    activity,
    lastActivity: activity[0] || null,
  });
});

// GET /api/persons/:id/history - admin only - the full field-change audit trail
const getPersonHistory = asyncHandler(async (req, res) => {
  const history = await ChangeHistory.find({ entityType: "Person", entityId: req.params.id })
    .sort({ createdAt: -1 })
    .populate("changedBy", "name");
  return res.json({ history });
});

// PATCH /api/persons/:id - admin only
const updatePerson = asyncHandler(async (req, res) => {
  const allowed = ["name", "nameMr", "designation", "designationMr", "email", "address", "addressMr", "district", "notes"];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const before = await Person.findById(req.params.id);
  if (!before) return res.status(404).json({ error: "Not found" });

  // A phone change doesn't erase the old number - it moves to
  // previousPhones, so "what number did they use to have" stays answerable
  // even without digging through ChangeHistory.
  if ("phone" in req.body) {
    const normalizedPhone = normalizePhone(req.body.phone);
    if (normalizedPhone && normalizedPhone !== before.phone) {
      if (before.phone) {
        updates.$push = { previousPhones: { number: before.phone, replacedAt: new Date() } };
      }
      updates.phone = normalizedPhone;
    }
  }

  const { $push, ...setFields } = updates;
  const person = await Person.findByIdAndUpdate(
    req.params.id,
    $push ? { $set: setFields, $push } : setFields,
    { new: true }
  );

  await logFieldChanges({
    entityType: "Person",
    entityId: person._id,
    before,
    updates: setFields,
    changedBy: req.user.id,
  });

  emitToAdmins("person:updated", person);
  return res.json({ person });
});

// DELETE /api/persons/:id - admin only
const deletePerson = asyncHandler(async (req, res) => {
  await Person.findByIdAndDelete(req.params.id);
  await PersonAssignment.deleteMany({ personId: req.params.id });

  emitToAdmins("person:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

/**
 * Records a transfer: closes the person's current posting at one
 * Grampanchayat (sets toDate) and opens a new one at another - this is how
 * "did he move, or is he still at the same place" gets tracked over time.
 * POST /api/persons/:id/transfer - admin only
 */
const transferPerson = asyncHandler(async (req, res) => {
  const { newGramPanchayatId, closeCurrentPostings, confirmReplace } = req.body;
  if (!newGramPanchayatId) {
    return res.status(400).json({ error: "newGramPanchayatId is required" });
  }

  const person = await Person.findById(req.params.id);
  if (!person) return res.status(404).json({ error: "Not found" });

  // Same single-holder rule as adding a contact directly: the destination
  // Grampanchayat can't end up with two current Talathis (etc.) because of
  // a transfer either.
  const conflict = await findHolderConflict({
    gramPanchayatId: newGramPanchayatId,
    designation: person.designation,
    excludePersonId: person._id,
  });
  if (conflict && !confirmReplace) {
    return res.status(409).json({
      error: "ALREADY_HAS_HOLDER",
      requiresConfirmation: true,
      conflict: { assignmentId: conflict._id, person: conflict.personId, designation: person.designation },
      message: `${conflict.personId?.name || "Someone"} is already recorded as the ${person.designation} at that Grampanchayat. Replacing them will move that person to past contacts.`,
    });
  }
  if (conflict && confirmReplace) {
    await replaceHolder({ conflict, gramPanchayatId: newGramPanchayatId, designation: person.designation, newPerson: person, changedBy: req.user.id });
  }

  if (closeCurrentPostings !== false) {
    await PersonAssignment.updateMany(
      { personId: req.params.id, toDate: null },
      { toDate: new Date() }
    );
  }

  const assignment = await PersonAssignment.create({
    personId: req.params.id,
    gramPanchayatId: newGramPanchayatId,
    designationAtAssignment: person.designation,
    fromDate: new Date(),
    toDate: null,
  });

  emitToAdmins("person:transferred", { personId: req.params.id, assignment });
  return res.status(201).json({ assignment });
});

module.exports = {
  listPersons, getFilterOptions, exportPersons, createPerson, getPerson, getPersonHistory, updatePerson,
  deletePerson, transferPerson,
};
