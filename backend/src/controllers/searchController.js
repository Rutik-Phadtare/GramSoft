const ActivityLog = require("../models/ActivityLog");
const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const User = require("../models/User");
const { escapeRegex } = require("../utils/normalize");
const { buildNameSearchClauses } = require("../utils/bilingual");
const { asyncHandler } = require("../utils/asyncHandler");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");

// GET /api/search?q=&type=&designation=&from=&to=&page=&limit= - admin only
//
// Free-text name search fans out across all three "who/where" entities -
// this is what lets an admin type "Kadam" or "Shivane" and get every
// activity touching that person or Grampanchayat, regardless of which
// employee logged it.
const globalSearch = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  const { type, designation, from, to } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
  const filter = {};

  if (q) {
    const regex = { $regex: escapeRegex(q), $options: "i" };
    const [gps, persons, users] = await Promise.all([
      // Matches on either language - a GP/person with only an English name,
      // only a Marathi name, or both, is found either way.
      // Cross-script: "shivane" finds शिवणे and vice versa, from the start of any word.
      GramPanchayat.find({ $or: buildNameSearchClauses(q) }).select("_id").limit(2000).lean(),
      Person.find({ $or: buildNameSearchClauses(q) }).select("_id").limit(2000).lean(),
      User.find({ name: regex }).select("_id"),
    ]);
    const gpIds = gps.map((g) => g._id);
    const personIds = persons.map((p) => p._id);
    const userIds = users.map((u) => u._id);

    if (gpIds.length === 0 && personIds.length === 0 && userIds.length === 0) {
      return res.json({ entries: [], pagination: buildPaginationMeta(1, limit, 0) });
    }

    filter.$or = [
      ...(gpIds.length ? [{ gramPanchayatId: { $in: gpIds } }] : []),
      ...(personIds.length ? [{ personId: { $in: personIds } }] : []),
      ...(userIds.length ? [{ employeeId: { $in: userIds } }] : []),
    ];
  }

  if (type) filter.type = type;
  if (designation) filter.designationSnapshot = designation;
  if (from || to) {
    filter.date = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(to) } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employeeId", "name")
      .populate("gramPanchayatId", "name nameMr taluka talukaMr")
      .populate("personId", "name nameMr designation phone"),
    ActivityLog.countDocuments(filter),
  ]);

  return res.json({ entries, pagination: buildPaginationMeta(page, limit, total) });
});

module.exports = { globalSearch };
