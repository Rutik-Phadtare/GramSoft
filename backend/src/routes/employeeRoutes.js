const express = require("express");
const {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, employeeOverview, getEmployeeDetail,
  getPermissionRegistry,
} = require("../controllers/employeeController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/overview", protect, employeeOverview);

// Must be registered before /:id so "permissions" doesn't get captured as an id.
router.get("/permissions/registry", protect, requireAdmin, getPermissionRegistry);

router.get("/", protect, requireAdmin, listEmployees);
router.post("/", protect, requireAdmin, createEmployee);
router.get("/:id", protect, requireAdmin, getEmployeeDetail);
router.patch("/:id", protect, requireAdmin, updateEmployee);
router.delete("/:id", protect, requireAdmin, deleteEmployee);

module.exports = router;
