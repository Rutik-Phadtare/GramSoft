const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  submitRegistration, listRegistrations, getRegistration, updateRegistrationStatus, updateRegistrationDetails, mergeRegistration,
} = require("../controllers/registrationController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Same light rate limit as the feedback form's public submit - no login to
// lean on here either.
const publicSubmitLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

router.post("/", publicSubmitLimiter, submitRegistration);
router.get("/", protect, requireAdmin, listRegistrations);
router.get("/:id", protect, requireAdmin, getRegistration);
router.patch("/:id", protect, requireAdmin, updateRegistrationStatus);
router.patch("/:id/details", protect, requireAdmin, updateRegistrationDetails);
router.post("/:id/merge", protect, requireAdmin, mergeRegistration);

module.exports = router;
