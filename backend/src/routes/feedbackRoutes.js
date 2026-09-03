const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  submitFeedback, listFeedback, updateFeedbackStatus, updateFeedbackDetails, mergeFeedback, exportFeedback,
} = require("../controllers/feedbackController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// The public submit endpoint gets its own light rate limit since it has no
// login to lean on.
const publicSubmitLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

router.post("/", publicSubmitLimiter, submitFeedback);
// Must be registered before /:id so "export" doesn't get captured as an id.
router.get("/export", protect, requireAdmin, exportFeedback);
router.get("/", protect, requireAdmin, listFeedback);
router.patch("/:id", protect, requireAdmin, updateFeedbackStatus);
router.patch("/:id/details", protect, requireAdmin, updateFeedbackDetails);
router.post("/:id/merge", protect, requireAdmin, mergeFeedback);

module.exports = router;
