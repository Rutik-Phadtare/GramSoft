const bcrypt = require("bcryptjs");
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { PERMISSIONS, PERMISSION_KEYS } = require("../config/permissions");

// GET /api/employees - admin only
const listEmployees = asyncHandler(async (req, res) => {
  const employees = await User.find({}).select("-passwordHash").sort({ createdAt: -1 });
  return res.json({ employees });
});

// GET /api/employees/permissions/registry - admin only. Serves the full
// permission catalog (key, label, hint, group, default) so the Settings UI
// can render the toggles/grouping purely from data instead of a hardcoded
// frontend list that has to be kept in sync by hand.
const getPermissionRegistry = asyncHandler(async (req, res) => {
  return res.json({ permissions: PERMISSIONS });
});

function cleanPermissions(input) {
  if (!input || typeof input !== "object") return undefined;
  const cleaned = {};
  for (const key of PERMISSION_KEYS) {
    if (key in input) cleaned[key] = Boolean(input[key]);
  }
  return Object.keys(cleaned).length ? cleaned : undefined;
}

// POST /api/employees - admin only
const createEmployee = asyncHandler(async (req, res) => {
  const { name, email, password, role, team, permissions } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: String(email).toLowerCase().trim(),
    passwordHash,
    role: role === "admin" ? "admin" : "employee",
    team: team || undefined,
    active: true,
    ...(cleanPermissions(permissions) ? { permissions: cleanPermissions(permissions) } : {}),
  });

  const employee = { id: user._id, name: user.name, email: user.email, role: user.role, team: user.team, permissions: user.permissions };
  emitToAdmins("employee:new", employee);
  return res.status(201).json({ employee });
});

// PATCH /api/employees/:id - admin only
const updateEmployee = asyncHandler(async (req, res) => {
  const body = req.body;
  const updates = {};
  if (typeof body.active === "boolean") updates.active = body.active;
  if (body.role === "admin" || body.role === "employee") updates.role = body.role;
  if (body.team === "sales" || body.team === "support") updates.team = body.team;
  if (body.name) updates.name = body.name;
  if (body.password) {
    if (body.password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    updates.passwordHash = await bcrypt.hash(body.password, 10);
  }

  // Each flag is set individually (rather than replacing the whole object)
  // so a partial update from the permissions editor never accidentally
  // resets flags the admin didn't touch.
  const cleanedPerms = cleanPermissions(body.permissions);
  if (cleanedPerms) {
    for (const key of Object.keys(cleanedPerms)) {
      updates[`permissions.${key}`] = cleanedPerms[key];
    }
  }

  const employee = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-passwordHash");
  if (!employee) return res.status(404).json({ error: "Not found" });

  emitToAdmins("employee:updated", employee);
  return res.json({ employee });
});

// DELETE /api/employees/:id - admin only
const deleteEmployee = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You can't delete your own account" });
  }
  await User.findByIdAndDelete(req.params.id);
  emitToAdmins("employee:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

// GET /api/employees/overview - any logged-in employee, their own stats
const employeeOverview = asyncHandler(async (req, res) => {
  const employeeId = req.user.id;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [entries, entriesThisWeek, loggedToday] = await Promise.all([
    ActivityLog.find({ employeeId })
      .sort({ date: -1 })
      .limit(10)
      .populate("gramPanchayatId", "name")
      .populate("personId", "name designation")
      .lean(),
    ActivityLog.countDocuments({ employeeId, date: { $gte: sevenDaysAgo } }),
    ActivityLog.countDocuments({ employeeId, date: { $gte: startOfToday } }),
  ]);

  return res.json({
    stats: { entriesThisWeek, loggedToday, totalShown: entries.length },
    entries,
    fetchedAt: new Date().toISOString(),
  });
});

// GET /api/employees/:id - admin only - profile + lifetime stats for the
// employee detail/drill-down page. Their actual day-by-day log entries are
// fetched separately via GET /api/activities?employeeId=... (already
// paginated/filterable), so this endpoint stays cheap and just answers
// "who are they and how much have they logged."
const getEmployeeDetail = asyncHandler(async (req, res) => {
  const employee = await User.findById(req.params.id).select("-passwordHash");
  if (!employee) return res.status(404).json({ error: "Not found" });

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalLogs, logsThisWeek, logsToday, firstLog] = await Promise.all([
    ActivityLog.countDocuments({ employeeId: req.params.id }),
    ActivityLog.countDocuments({ employeeId: req.params.id, date: { $gte: sevenDaysAgo } }),
    ActivityLog.countDocuments({ employeeId: req.params.id, date: { $gte: startOfToday } }),
    ActivityLog.findOne({ employeeId: req.params.id }).sort({ date: 1 }).select("date"),
  ]);

  return res.json({
    employee,
    stats: { totalLogs, logsThisWeek, logsToday, firstLoggedAt: firstLog?.date || null },
  });
});

module.exports = {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, employeeOverview, getEmployeeDetail,
  getPermissionRegistry,
};
