const express = require("express");
const { createTask, listTasks, updateTask, updateTaskStatus, deleteTask } = require("../controllers/taskController");
const { protect, requireAdmin, requirePermission } = require("../middleware/auth");

const router = express.Router();

router.get("/", protect, requirePermission("viewTasks"), listTasks); // admins see everyone's (or filtered), employees see only their own
router.post("/", protect, requireAdmin, createTask);
router.patch("/:id", protect, requireAdmin, updateTask);
router.patch("/:id/status", protect, requirePermission("viewTasks"), updateTaskStatus); // employee updates their own, or admin any
router.delete("/:id", protect, requireAdmin, deleteTask);

module.exports = router;
