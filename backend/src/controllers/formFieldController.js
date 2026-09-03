const FormFieldConfig = require("../models/FormFieldConfig");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { slugify, isReservedKey, isValidSlug } = require("../utils/dynamicFields");

const TARGETS = ["feedback", "activity", "registration", "gramPanchayat", "contact"];

// GET /api/form-fields?target=feedback|activity|registration|gramPanchayat|contact&activityTypeKey=
// Intentionally public. The public /feedback and /register pages need to
// read their own field list without being logged in, and the employee
// activity form calls this while logged in as a plain employee - so it
// can't be admin-only. Nothing sensitive lives in a field's label/type/options.
// Only returns *active* fields - this is "what should the form ask right now".
//
// For target=activity:
//   - activityTypeKey given  -> global fields (activityTypeKey: null) PLUS
//     fields scoped to that specific Activity Type. This is what the
//     employee's Activity form uses once a type is selected.
//   - activityTypeKey omitted -> every activity field, global and
//     type-scoped alike.
const listFormFields = asyncHandler(async (req, res) => {
  const { target, activityTypeKey } = req.query;
  if (!TARGETS.includes(target)) {
    return res.status(400).json({ error: `target must be one of: ${TARGETS.join(", ")}` });
  }

  const filter = { target, active: true };
  if (target === "activity" && activityTypeKey) {
    filter.activityTypeKey = { $in: [null, activityTypeKey] };
  }

  const fields = await FormFieldConfig.find(filter).sort({ order: 1 });
  return res.json({ fields });
});

// GET /api/form-fields/manage?target=&activityTypeKey= - admin only.
// Same shape as listFormFields but includes inactive fields too, since the
// Form Builder needs to show disabled fields (with a toggle) rather than
// hide them entirely.
const listFormFieldsForAdmin = asyncHandler(async (req, res) => {
  const { target, activityTypeKey } = req.query;
  if (!TARGETS.includes(target)) {
    return res.status(400).json({ error: `target must be one of: ${TARGETS.join(", ")}` });
  }

  const filter = { target };
  if (target === "activity" && activityTypeKey) {
    filter.activityTypeKey = { $in: [null, activityTypeKey] };
  }

  const fields = await FormFieldConfig.find(filter).sort({ order: 1 });
  return res.json({ fields });
});

function buildFieldPayload(body) {
  const { target, activityTypeKey, key, label, type, options, required, placeholder, helpText, defaultValue, validation, visibleWhen } = body;
  return { target, activityTypeKey, key, label, type, options, required, placeholder, helpText, defaultValue, validation, visibleWhen };
}

// POST /api/form-fields - admin only
const createFormField = asyncHandler(async (req, res) => {
  const payload = buildFieldPayload(req.body);
  const { target, label, type } = payload;

  if (!target || !TARGETS.includes(target)) {
    return res.status(400).json({ error: `target must be one of: ${TARGETS.join(", ")}` });
  }
  if (!label || !type) {
    return res.status(400).json({ error: "label and type are required" });
  }
  if (!FormFieldConfig.FIELD_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${FormFieldConfig.FIELD_TYPES.join(", ")}` });
  }

  const slug = slugify(payload.key || label);
  if (!slug || !isValidSlug(slug)) {
    return res.status(400).json({ error: "key must contain at least one letter or number" });
  }
  if (isReservedKey(slug)) {
    return res.status(400).json({ error: `"${slug}" is a reserved system key and can't be used for a custom field` });
  }

  const activityTypeKey = target === "activity" ? payload.activityTypeKey || null : null;

  const existing = await FormFieldConfig.findOne({ target, activityTypeKey, key: slug });
  if (existing) {
    return res.status(409).json({ error: "A field with this key already exists for this form" });
  }

  const count = await FormFieldConfig.countDocuments({ target, activityTypeKey });
  const field = await FormFieldConfig.create({
    target,
    activityTypeKey,
    key: slug,
    label,
    type,
    options: ["select", "multiselect", "radio"].includes(type) ? payload.options : undefined,
    required: Boolean(payload.required),
    placeholder: payload.placeholder,
    helpText: payload.helpText,
    defaultValue: payload.defaultValue,
    validation: payload.validation,
    visibleWhen: payload.visibleWhen,
    order: count,
    active: true,
  });

  emitToAdmins("formField:new", field);
  return res.status(201).json({ field });
});

// PATCH /api/form-fields/:id - admin only
const updateFormField = asyncHandler(async (req, res) => {
  const allowed = [
    "label", "type", "options", "required", "order", "active",
    "activityTypeKey", "placeholder", "helpText", "defaultValue", "validation", "visibleWhen",
  ];
  const updates = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (updates.type && !FormFieldConfig.FIELD_TYPES.includes(updates.type)) {
    return res.status(400).json({ error: `type must be one of: ${FormFieldConfig.FIELD_TYPES.join(", ")}` });
  }

  const field = await FormFieldConfig.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!field) return res.status(404).json({ error: "Not found" });

  emitToAdmins("formField:updated", field);
  return res.json({ field });
});

// POST /api/form-fields/:id/duplicate - admin only
const duplicateFormField = asyncHandler(async (req, res) => {
  const source = await FormFieldConfig.findById(req.params.id).lean();
  if (!source) return res.status(404).json({ error: "Not found" });

  let copyKey = `${source.key}_copy`;
  let n = 2;
  // Guard against repeated duplicate clicks colliding on the same slug.
  while (await FormFieldConfig.findOne({ target: source.target, activityTypeKey: source.activityTypeKey || null, key: copyKey })) {
    copyKey = `${source.key}_copy_${n++}`;
  }

  const count = await FormFieldConfig.countDocuments({ target: source.target, activityTypeKey: source.activityTypeKey || null });
  const { _id, createdAt, updatedAt, ...rest } = source;
  const field = await FormFieldConfig.create({
    ...rest,
    key: copyKey,
    label: `${source.label} (copy)`,
    order: count,
  });

  emitToAdmins("formField:new", field);
  return res.status(201).json({ field });
});

// PATCH /api/form-fields/reorder - admin only
// Body: { target, activityTypeKey?, order: [{ id, order }, ...] }
const reorderFormFields = asyncHandler(async (req, res) => {
  const { target, activityTypeKey, order } = req.body;
  if (!target || !TARGETS.includes(target) || !Array.isArray(order)) {
    return res.status(400).json({ error: "target and order[] are required" });
  }

  const ops = order.map(({ id, order: pos }) => ({
    updateOne: {
      filter: { _id: id, target, activityTypeKey: target === "activity" ? activityTypeKey || null : null },
      update: { $set: { order: pos } },
    },
  }));
  if (ops.length) await FormFieldConfig.bulkWrite(ops);

  const fields = await FormFieldConfig.find({
    target,
    activityTypeKey: target === "activity" ? { $in: [null, activityTypeKey].filter((v, i, a) => a.indexOf(v) === i) } : null,
  }).sort({ order: 1 });

  emitToAdmins("formField:reordered", { target, activityTypeKey: activityTypeKey || null });
  return res.json({ fields });
});

// DELETE /api/form-fields/:id - admin only
const deleteFormField = asyncHandler(async (req, res) => {
  await FormFieldConfig.findByIdAndDelete(req.params.id);
  // Historical records keep whatever was already saved under this key in
  // their customFields - deleting the config just stops asking the question
  // (see requirements doc #21 - this must never touch existing submissions).
  emitToAdmins("formField:deleted", { id: req.params.id });
  return res.json({ ok: true });
});

module.exports = {
  listFormFields,
  listFormFieldsForAdmin,
  createFormField,
  updateFormField,
  duplicateFormField,
  reorderFormFields,
  deleteFormField,
};
