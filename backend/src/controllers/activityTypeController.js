const ActivityTypeConfig = require("../models/ActivityTypeConfig");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");

// GET /api/activity-types - any logged-in user (employee or admin); the
// activity form and explorer both need this list, and it's not sensitive.
// Only returns active types - this is "what an employee can currently pick".
const listActivityTypes = asyncHandler(async (req, res) => {
  const count = await ActivityTypeConfig.countDocuments({});
  if (count === 0) {
    // First run - seed the defaults so nothing breaks for setups that
    // never touch Settings.
    await ActivityTypeConfig.insertMany(
      ActivityTypeConfig.DEFAULT_ACTIVITY_TYPES.map((t, i) => ({ ...t, order: i, active: true }))
    );
  }

  const types = await ActivityTypeConfig.find({ active: true }).sort({ order: 1 });
  return res.json({ types });
});

// GET /api/activity-types/manage - admin only; includes inactive types too,
// since the Settings screen needs to show (and let an admin re-enable) a
// disabled type, not just active ones.
const listActivityTypesForAdmin = asyncHandler(async (req, res) => {
  const types = await ActivityTypeConfig.find({}).sort({ order: 1 });
  return res.json({ types });
});

// POST /api/activity-types - admin only
const createActivityType = asyncHandler(async (req, res) => {
  const { label, showGramPanchayat, requireGramPanchayat, showContact, requireContact } = req.body;
  if (!label) {
    return res.status(400).json({ error: "label is required" });
  }
  const key = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) {
    return res.status(400).json({ error: "label must contain at least one letter or number" });
  }

  const existing = await ActivityTypeConfig.findOne({ key });
  if (existing) {
    return res.status(409).json({ error: "A type with this name already exists" });
  }

  const flags = {
    showGramPanchayat: showGramPanchayat !== false,
    requireGramPanchayat: requireGramPanchayat !== false,
    showContact: showContact !== false,
    requireContact: Boolean(requireContact),
  };
  if (!flags.showGramPanchayat) {
    flags.requireGramPanchayat = false;
    flags.showContact = false;
    flags.requireContact = false;
  } else if (!flags.showContact) {
    flags.requireContact = false;
  }

  const count = await ActivityTypeConfig.countDocuments({});
  const type = await ActivityTypeConfig.create({ key, label, order: count, active: true, ...flags });

  emitToAdmins("activityType:new", type);
  return res.status(201).json({ type });
});

// PATCH /api/activity-types/:id - admin only
const updateActivityType = asyncHandler(async (req, res) => {
  const allowed = ["label", "order", "active", "showGramPanchayat", "requireGramPanchayat", "showContact", "requireContact"];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const current = await ActivityTypeConfig.findById(req.params.id);
  if (!current) return res.status(404).json({ error: "Not found" });

  // Merge onto current values so a partial update (e.g. only toggling
  // requireContact) is checked against the type's actual resulting state,
  // not just whatever happened to be in this one request body.
  const next = { ...current.toObject(), ...updates };

  // Contact is scoped BY the selected Gram Panchayat (see
  // personController#listPersons) - it can never be shown, let alone
  // required, while Gram Panchayat itself is hidden. And nothing can be
  // "required" without also being "shown".
  if (!next.showGramPanchayat) {
    updates.requireGramPanchayat = false;
    updates.showContact = false;
    updates.requireContact = false;
  } else if (!next.showContact) {
    updates.requireContact = false;
  }

  const type = await ActivityTypeConfig.findByIdAndUpdate(req.params.id, updates, { new: true });

  emitToAdmins("activityType:updated", type);
  return res.json({ type });
});

// DELETE /api/activity-types/:id - admin only
const deleteActivityType = asyncHandler(async (req, res) => {
  await ActivityTypeConfig.findByIdAndDelete(req.params.id);
  // Past activity entries keep whatever type string they were saved with -
  // deleting the config just stops offering it as an option going forward.
  emitToAdmins("activityType:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

module.exports = { listActivityTypes, listActivityTypesForAdmin, createActivityType, updateActivityType, deleteActivityType };
