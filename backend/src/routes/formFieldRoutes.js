const express = require("express");
const {
  listFormFields, listFormFieldsForAdmin, createFormField, updateFormField,
  duplicateFormField, reorderFormFields, deleteFormField,
} = require("../controllers/formFieldController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// GET / is public on purpose (see controller comment) - only returns active fields.
router.get("/", listFormFields);
// GET /manage is admin-only and includes inactive fields, for the Form Builder.
router.get("/manage", protect, requireAdmin, listFormFieldsForAdmin);
router.patch("/reorder", protect, requireAdmin, reorderFormFields);
router.post("/", protect, requireAdmin, createFormField);
router.post("/:id/duplicate", protect, requireAdmin, duplicateFormField);
router.patch("/:id", protect, requireAdmin, updateFormField);
router.delete("/:id", protect, requireAdmin, deleteFormField);

module.exports = router;
