const express = require("express");
const {
  listActivityTypes, listActivityTypesForAdmin, createActivityType, updateActivityType, deleteActivityType,
} = require("../controllers/activityTypeController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", protect, listActivityTypes);
router.get("/manage", protect, requireAdmin, listActivityTypesForAdmin);
router.post("/", protect, requireAdmin, createActivityType);
router.patch("/:id", protect, requireAdmin, updateActivityType);
router.delete("/:id", protect, requireAdmin, deleteActivityType);

module.exports = router;
