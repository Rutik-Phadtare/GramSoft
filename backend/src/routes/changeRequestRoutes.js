const express = require("express");
const {
  createChangeRequest, listChangeRequests, getChangeRequestDetail, updateChangeRequest, approveChangeRequest, rejectChangeRequest,
} = require("../controllers/changeRequestController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/", protect, createChangeRequest);
router.get("/", protect, requireAdmin, listChangeRequests);
router.get("/:id", protect, requireAdmin, getChangeRequestDetail);
router.patch("/:id", protect, requireAdmin, updateChangeRequest);
router.post("/:id/approve", protect, requireAdmin, approveChangeRequest);
router.post("/:id/reject", protect, requireAdmin, rejectChangeRequest);

module.exports = router;
