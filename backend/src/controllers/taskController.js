const Task = require("../models/Task");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins, emitToUser } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { createAdminNotification } = require("./notificationController");

// POST /api/tasks - admin only
// Assigns a task to one employee, optionally scoped to a Grampanchayat -
// e.g. "attend the demo at X Grampanchayat" - so the employee sees exactly
// what's expected and the admin can later pull a report on it.
const createTask = asyncHandler(async (req, res) => {
  const { title, description, assignedTo, gramPanchayatId, priority, dueDate } = req.body;
  if (!title || !assignedTo) {
    return res.status(400).json({ error: "title and assignedTo are required" });
  }

  const task = await Task.create({
    title,
    description,
    assignedTo,
    assignedBy: req.user.id,
    gramPanchayatId: gramPanchayatId || undefined,
    priority: priority || "normal",
    dueDate: dueDate ? new Date(dueDate) : undefined,
    status: "pending",
  });
  await task.populate([
    { path: "assignedTo", select: "name email team" },
    { path: "assignedBy", select: "name" },
    { path: "gramPanchayatId", select: "name taluka district" },
  ]);

  emitToUser(assignedTo, "task:new", task);
  emitToAdmins("task:new", task);
  return res.status(201).json({ task });
});

// GET /api/tasks?assignedTo=&status=&page=&limit=
// Admins can see everyone's tasks (optionally filtered to one employee);
// an employee only ever sees their own, regardless of what's in the query.
const listTasks = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const filter = {};
  if (status) filter.status = status;
  if (req.user.role === "admin") {
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
  } else {
    filter.assignedTo = req.user.id;
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("assignedTo", "name email team")
      .populate("assignedBy", "name")
      .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr"),
    Task.countDocuments(filter),
  ]);

  return res.json({ tasks, pagination: buildPaginationMeta(page, limit, total) });
});

// PATCH /api/tasks/:id - admin only - edit the task itself (title, due date, reassign, etc.)
const updateTask = asyncHandler(async (req, res) => {
  const allowed = ["title", "description", "assignedTo", "gramPanchayatId", "priority", "dueDate"];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key] || undefined;
  }
  if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

  const task = await Task.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate("assignedTo", "name email team")
    .populate("assignedBy", "name")
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr");
  if (!task) return res.status(404).json({ error: "Not found" });

  emitToUser(task.assignedTo._id, "task:updated", task);
  emitToAdmins("task:updated", task);
  return res.json({ task });
});

// PATCH /api/tasks/:id/status - the assigned employee (or an admin) updates
// status and optionally leaves a report. This is how the admin gets back
// "what happened" on a task they handed out.
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status, report } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ error: "Not found" });

  const isOwner = task.assignedTo.toString() === req.user.id;
  if (req.user.role !== "admin" && !isOwner) {
    return res.status(403).json({ error: "You can only update your own tasks" });
  }

  if (status) {
    if (!Task.STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${Task.STATUSES.join(", ")}` });
    }
    task.status = status;
  }
  if (typeof report === "string") {
    task.report = report;
    task.reportedAt = new Date();
  }
  await task.save();
  await task.populate([
    { path: "assignedTo", select: "name email team" },
    { path: "assignedBy", select: "name" },
    { path: "gramPanchayatId", select: "name taluka district" },
  ]);

  emitToAdmins("task:updated", task);
  emitToUser(task.assignedTo._id, "task:updated", task);

  if (req.user.role !== "admin") {
    await createAdminNotification({
      type: "task",
      section: "tasks",
      title: `Task update: ${task.title}`,
      message: `${task.assignedTo?.name || "Employee"} updated the task to ${String(task.status || "updated").replace(/_/g, " ")}.`,
      link: "/admin/tasks",
      sourceId: task._id,
    });
  }

  return res.json({ task });
});

// DELETE /api/tasks/:id - admin only
const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) return res.status(404).json({ error: "Not found" });

  emitToAdmins("task:deleted", { id: req.params.id });
  emitToUser(task.assignedTo, "task:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

module.exports = { createTask, listTasks, updateTask, updateTaskStatus, deleteTask };
