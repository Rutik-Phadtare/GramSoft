const express = require("express");
const { adminOverview } = require("../controllers/overviewController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/admin", protect, requireAdmin, adminOverview);

module.exports = router;
