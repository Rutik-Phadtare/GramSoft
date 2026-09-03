const express = require("express");
const {
  listPersons, getFilterOptions, exportPersons, createPerson, getPerson, getPersonHistory,
  updatePerson, deletePerson, transferPerson,
} = require("../controllers/personController");
const { protect, requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.get("/filter-options", protect, requireAdmin, getFilterOptions);
router.get("/export", protect, requireAdmin, exportPersons);
router.get("/", protect, requirePermission("viewContacts"), listPersons);
router.post("/", protect, requireAdmin, createPerson);
router.get("/:id", protect, requirePermission("viewContacts"), getPerson);
router.get("/:id/history", protect, requireAdmin, getPersonHistory);
router.patch("/:id", protect, requireAdmin, updatePerson);
router.delete("/:id", protect, requireAdmin, deletePerson);
router.post("/:id/transfer", protect, requireAdmin, transferPerson);

module.exports = router;
