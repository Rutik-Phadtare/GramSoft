const express = require("express");
const multer = require("multer");
const { importSpreadsheet } = require("../controllers/importController");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();

// Kept in memory (not written to disk) - sheets are small and processed
// once, no reason to touch the filesystem for them.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Admin only - bulk import writes directly to the live GramPanchayat/Person
// directory (via upsertGramPanchayatAndPerson), bypassing the normal
// employee-proposes/admin-approves ChangeRequest workflow entirely. Without
// this gate, any authenticated employee (including one with every
// permission toggle turned off) could mass-create or silently modify
// directory records - a much bigger hole than the single-record edit
// permissions the rest of the app carefully enforces.
router.post("/", protect, requireAdmin, upload.single("file"), importSpreadsheet);

module.exports = router;
