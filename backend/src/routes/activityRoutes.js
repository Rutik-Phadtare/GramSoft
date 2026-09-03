const express = require("express");
const { createActivity, listActivities, exportActivities } = require("../controllers/activityController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Order matters - /export must be registered before /:id-style wildcards
// would ever be added for this resource.
router.get("/export", protect, requireAdmin, exportActivities);
router.get("/", protect, listActivities);
router.post("/", protect, createActivity);

module.exports = router;
