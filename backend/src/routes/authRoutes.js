const express = require("express");
const rateLimit = require("express-rate-limit");
const { login, me } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Throttle login attempts per IP to slow down credential-stuffing / brute
// force attacks. 10 attempts per 5 minutes is generous for a real user who
// mistypes a password, but useless for an automated guesser.
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a few minutes and try again." },
});

router.post("/login", loginLimiter, login);
router.get("/me", protect, me);

module.exports = router;
