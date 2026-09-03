const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { emitToUser } = require("../sockets");

const SECTION_BY_TYPE = {
  activity: "dashboard",
  feedback: "feedback",
  registration: "registrations",
  change_request: "approvals",
};

function normalizeNotification(notification) {
  const item = notification.toObject ? notification.toObject() : { ...notification };
  if (!item.section) item.section = SECTION_BY_TYPE[item.type] || "dashboard";
  return item;
}

function recipientFilter(userId) {
  return { $or: [{ recipient: userId }, { recipient: null }] };
}

/**
 * Create one notification per active admin. This keeps read state private to
 * each admin while still broadcasting the same business event to everyone.
 */
const createAdminNotification = async ({ type, section, title, message, link, sourceId }) => {
  const resolvedSection = section || SECTION_BY_TYPE[type] || "dashboard";
  const admins = await User.find({ role: "admin", active: true }).select("_id").lean();

  if (!admins.length) return null;

  const docs = admins.map((admin) => ({
    type,
    section: resolvedSection,
    title,
    message,
    link,
    sourceId,
    recipient: admin._id,
  }));

  const notifications = await Notification.insertMany(docs, { ordered: true });
  for (const notification of notifications) {
    emitToUser(notification.recipient.toString(), "notification:new", notification);
  }

  return notifications[0] || null;
};

const listNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const baseFilter = recipientFilter(req.user.id);
  const filter = unreadOnly === "true"
    ? { ...baseFilter, readAt: null }
    : baseFilter;

  const [rawNotifications, total, unreadCount, unreadBySection] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...baseFilter, readAt: null }),
    Notification.aggregate([
      { $match: { $or: [{ recipient: new mongoose.Types.ObjectId(req.user.id) }, { recipient: null }], readAt: null } },
      {
        $group: {
          _id: { $ifNull: ["$section", "$type"] },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const notifications = rawNotifications.map(normalizeNotification);
  const sectionCounts = {
    dashboard: 0,
    grampanchayats: 0,
    contacts: 0,
    feedback: 0,
    registrations: 0,
    approvals: 0,
    tasks: 0,
    employees: 0,
    settings: 0,
  };

  for (const row of unreadBySection) {
    const section = SECTION_BY_TYPE[row._id] || row._id;
    if (section in sectionCounts) sectionCounts[section] += row.count;
  }

  return res.json({
    notifications,
    unreadCount,
    sectionCounts,
    pagination: buildPaginationMeta(page, limit, total),
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...recipientFilter(req.user.id) },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) return res.status(404).json({ error: "Notification not found" });

  const normalized = normalizeNotification(notification);
  emitToUser(req.user.id, "notification:updated", normalized);
  return res.json({ notification: normalized });
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { ...recipientFilter(req.user.id), readAt: null },
    { $set: { readAt: new Date() } }
  );

  emitToUser(req.user.id, "notification:updated", { allRead: true });
  return res.json({ ok: true });
});

// PATCH /api/notifications/read-section/:section - admin only
//
// Marks every unread notification in one nav section (e.g. "feedback") as
// read for this admin. This is what actually clears a nav badge: it runs
// when the admin *visits* that section's page, instead of requiring them
// to open a separate notification popup first - visiting the page is
// itself the "I've seen this" signal.
const markSectionNotificationsRead = asyncHandler(async (req, res) => {
  const { section } = req.params;
  await Notification.updateMany(
    { ...recipientFilter(req.user.id), section, readAt: null },
    { $set: { readAt: new Date() } }
  );

  emitToUser(req.user.id, "notification:updated", { sectionRead: section });
  return res.json({ ok: true, section });
});

module.exports = {
  createAdminNotification,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSectionNotificationsRead,
};
