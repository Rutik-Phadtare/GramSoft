const express = require("express");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markSectionNotificationsRead,
} = require("../controllers/notificationController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", protect, requireAdmin, listNotifications);
router.patch("/:id/read", protect, requireAdmin, markNotificationRead);
router.patch("/read-all", protect, requireAdmin, markAllNotificationsRead);
router.patch("/read-section/:section", protect, requireAdmin, markSectionNotificationsRead);

module.exports = router;
