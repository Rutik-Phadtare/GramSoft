const express = require("express");
const { createActivity, listActivities, exportActivities, exportActivity, getActivityDetail } = require("../controllers/activityController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Order matters - /export must be registered before the /:id wildcards.
router.get("/export", protect, requireAdmin, exportActivities);
router.get("/:id/export", protect, requireAdmin, exportActivity);
router.get("/:id", protect, requireAdmin, getActivityDetail);
router.get("/", protect, listActivities);
router.post("/", protect, createActivity);

module.exports = router;
