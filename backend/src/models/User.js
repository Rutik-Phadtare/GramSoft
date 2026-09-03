const { Schema, model, models } = require("mongoose");
const { PERMISSIONS } = require("../config/permissions");

// Built from the permission registry instead of hand-listed, so adding a
// new entry to config/permissions.js is the only change needed for a new
// toggle to exist on every user document, defaulted correctly.
const permissionsSchemaDef = {};
for (const p of PERMISSIONS) {
  permissionsSchemaDef[p.key] = { type: Boolean, default: p.default };
}

// role: who they are in the system. team: which desk they sit on (only
// meaningful for employees) - used to slice reports by sales vs support.
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["employee", "admin"], required: true, default: "employee" },
    team: { type: String, enum: ["sales", "support"] },
    active: { type: Boolean, default: true },
    // Per-employee access control, set by an admin from Settings →
    // Employees. Meaningless for role "admin" (admins always have full
    // access - see requirePermission in middleware/auth.js). Field list is
    // generated from config/permissions.js - see permissionsSchemaDef above.
    permissions: permissionsSchemaDef,
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

module.exports = models.User || model("User", UserSchema);
