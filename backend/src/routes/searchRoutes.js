const express = require("express");
const { globalSearch } = require("../controllers/searchController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", protect, requireAdmin, globalSearch);

module.exports = router;
