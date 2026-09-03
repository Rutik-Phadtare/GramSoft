const express = require("express");
const {
  listGramPanchayats, getFilterOptions, getRateDefaults, exportGramPanchayats, createGramPanchayat,
  getGramPanchayat, getGramPanchayatHistory, updateGramPanchayat, deleteGramPanchayat, addContact,
} = require("../controllers/gramPanchayatController");
const { protect, requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

// Order matters - static paths must be registered before /:id or they'd
// be swallowed as an id lookup.
router.get("/filter-options", protect, requireAdmin, getFilterOptions);
router.get("/rate-defaults", getRateDefaults);
router.get("/export", protect, requireAdmin, exportGramPanchayats);
router.get("/", protect, requirePermission("viewGramPanchayats"), listGramPanchayats);
router.post("/", protect, requireAdmin, createGramPanchayat);
router.get("/:id", protect, requirePermission("viewGramPanchayats"), getGramPanchayat);
router.get("/:id/history", protect, requireAdmin, getGramPanchayatHistory);
router.patch("/:id", protect, requireAdmin, updateGramPanchayat);
router.delete("/:id", protect, requireAdmin, deleteGramPanchayat);
router.post("/:id/contacts", protect, requireAdmin, addContact);

module.exports = router;
