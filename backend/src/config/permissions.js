// Single source of truth for every capability an admin can grant or revoke
// on a per-employee basis.
//
// This is intentionally the ONLY place a permission is defined. Everything
// else derives from this list at runtime:
//   - the User model's `permissions` sub-schema is generated from PERMISSIONS
//     (see models/User.js), so a Boolean field always exists for every key
//   - employeeController's cleanPermissions() validates incoming updates
//     against these keys instead of a separately-maintained array
//   - GET /api/employees/permissions/registry serves this list (label/hint/
//     group, never raw keys-only) so the frontend renders the permissions
//     editor and gates its own nav purely from data, not a hardcoded list
//
// To add a brand-new toggle for admins to control, add one entry here.
// Nothing else needs to change for it to show up in the Settings UI and be
// enforced by requirePermission(key) on any route that uses it.
const PERMISSIONS = [
  {
    key: "viewGramPanchayats",
    label: "View Grampanchayats",
    hint: "See the Grampanchayat directory and individual records.",
    group: "Directory",
    default: true,
  },
  {
    key: "editGramPanchayats",
    label: "Propose Grampanchayat edits",
    hint: "Submit edits to Grampanchayat records. Still requires admin approval.",
    group: "Directory",
    default: true,
  },
  {
    key: "viewContacts",
    label: "View contacts",
    hint: "See the contacts directory and individual contact records.",
    group: "Directory",
    default: true,
  },
  {
    key: "editContacts",
    label: "Propose contact edits",
    hint: "Submit edits to contact records. Still requires admin approval.",
    group: "Directory",
    default: true,
  },
  {
    key: "viewFinancials",
    label: "View billing / pricing details",
    hint: "See subscription, price, and rate-table fields on records they can otherwise access.",
    group: "Directory",
    default: true,
  },
  {
    key: "suggestChanges",
    label: "Submit general change suggestions",
    hint: "Raise system/process/data issues outside Grampanchayat and contact records. Still requires admin review.",
    group: "Workflow",
    default: true,
  },
  {
    key: "viewTasks",
    label: "View assigned tasks",
    hint: "See tasks an admin has assigned them, update status, and leave a report.",
    group: "Workflow",
    default: true,
  },
];

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

const DEFAULT_PERMISSIONS = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.default]));

module.exports = { PERMISSIONS, PERMISSION_KEYS, DEFAULT_PERMISSIONS };
