const ChangeRequest = require("../models/ChangeRequest");
const Person = require("../models/Person");
const GramPanchayat = require("../models/GramPanchayat");
const { validateDynamicFieldValues } = require("../utils/dynamicFields");
const FormFieldConfig = require("../models/FormFieldConfig");
const PersonAssignment = require("../models/PersonAssignment");
const ChangeHistory = require("../models/ChangeHistory");
const mongoose = require("mongoose");
const { normalizeName, normalizePhone } = require("../utils/normalize");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { logFieldChanges } = require("../utils/diffFields");
const { findHolderConflict, replaceHolder } = require("../utils/singleHolderGuard");
const { createAdminNotification } = require("./notificationController");
const ActivityLog = require("../models/ActivityLog");
const { validatePersonFields, buildPersonDoc, prepareGpContacts, createGpContacts } = require("../utils/gpContacts");


const PERSON_EDITABLE_FIELDS = ["name", "nameMr", "designation", "designationMr", "phone", "email", "address", "addressMr", "district", "notes"];
const GENERAL_EDITABLE_FIELDS = ["category", "targetArea", "title", "details", "requestedOutcome", "urgency", "page", "referenceId", "metadata"];
const GP_EDITABLE_FIELDS = [
  "name", "nameMr", "mukamPost", "taluka", "talukaMr", "district", "districtMr", "pincode",
  "officePhone", "officeEmail", "population", "numberOfHouseholds", "gpType", "waterSupplyMode",
  "reassessmentYearFrom", "reassessmentYearTo", "taxRates",
  "constructionRates", "landRates", "customFields", "contacts",
  "isUsingOurSoftware", "previousSoftwareUsed", "softwareStartDate",
  "subscriptionEndDate", "subscriptionYears", "priceAmount", "paymentMode", "status",
];

// Fields an admin may still adjust on a pending request. Workplace-change and
// replace-with-an-existing-person requests carry no editable field values
// (they only point at records), so nothing is editable there.
function editableFieldsFor(cr) {
  if (cr.action === "change_workplace") return [];
  if (cr.action === "replace_contact") return cr.isNewEntity ? PERSON_EDITABLE_FIELDS : [];
  if (cr.entityType === "Person") return PERSON_EDITABLE_FIELDS;
  return cr.entityType === "GramPanchayat" ? GP_EDITABLE_FIELDS : GENERAL_EDITABLE_FIELDS;
}


const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Applies an admin's edits on top of a request's proposedChanges (in memory).
// Only whitelisted fields are accepted, Person fields are validated, and a
// per-edit audit entry (who/when/from/to) is recorded on the request, along
// with the employee's untouched original the first time it is edited.
// Returns an error string or null.
function applyAdminEdits(changeRequest, edits, userId) {
  const editable = editableFieldsFor(changeRequest);
  const current = { ...(changeRequest.proposedChanges.toObject?.() ?? changeRequest.proposedChanges) };
  const accepted = {};
  for (const key of Object.keys(edits || {})) {
    if (editable.includes(key)) accepted[key] = edits[key];
  }
  if (changeRequest.entityType === "Person") {
    const err = validatePersonFields(accepted);
    if (err) return err;
  }
  // Changing the English designation on its own must not leave a stale Marathi
  // designation behind - drop it from the proposal unless the admin set it too.
  if ("designation" in accepted && !("designationMr" in accepted) && accepted.designation !== current.designation) {
    accepted.designationMr = "";
  }

  const diff = {};
  const merged = { ...current };
  for (const [key, value] of Object.entries(accepted)) {
    if (!sameValue(current[key], value)) {
      diff[key] = { from: current[key] ?? null, to: value };
      merged[key] = value;
    }
  }
  if (!Object.keys(diff).length) return null;

  if (!changeRequest.originalProposedChanges) {
    changeRequest.originalProposedChanges = current;
    changeRequest.markModified("originalProposedChanges");
  }
  changeRequest.proposedChanges = merged;
  changeRequest.markModified("proposedChanges");
  changeRequest.editHistory.push({ editedBy: userId, editedAt: new Date(), changes: diff });
  return null;
}

// Fields (of those being applied) whose live value no longer matches the
// snapshot taken when the employee proposed - i.e. someone changed the record
// since. Only meaningful for plain field edits on an existing record.
function staleFieldsFor(changeRequest, liveEntity) {
  if (!liveEntity || changeRequest.isNewEntity || changeRequest.action) return [];
  const prev = changeRequest.previousValues || {};
  const live = liveEntity.toObject?.() ?? liveEntity;
  return Object.keys(changeRequest.proposedChanges || {}).filter(
    (k) => k in prev && !sameValue(prev[k], live[k]) && !(prev[k] == null && live[k] == null)
  );
}

// "Name | Phone | Designation" - the one-line form used for contacts in
// history rows, so old/new contact values read the same everywhere.
const contactLabel = (p) => [p?.name || p?.nameMr, p?.phone, p?.designation].filter(Boolean).join(" | ");
const gpLabel = (gp) => (gp ? [gp.name || gp.nameMr, gp.taluka || gp.talukaMr].filter(Boolean).join(", ") : null);

// POST /api/change-requests - any logged-in employee
//
// Never touches the live record - just queues up what the employee says
// should change, for an admin to review. `entityId` is omitted (and
// `isNewEntity` set) when the employee is describing a contact that isn't
// in the directory at all yet.
const createChangeRequest = asyncHandler(async (req, res) => {
  const { entityType, entityId, proposedChanges, reason, relatedActivityLogId, gramPanchayatId } = req.body;

  if (!["Person", "GramPanchayat", "General"].includes(entityType)) {
    return res.status(400).json({ error: "entityType must be 'Person', 'GramPanchayat', or 'General'" });
  }

  // Admins can grant/revoke, per employee, whether they're even allowed to
  // propose changes to contacts vs. to Grampanchayat records - defaults to
  // allowed (matches the app's original behavior) unless an admin has
  // explicitly turned it off for this person.
  if (req.user.role !== "admin") {
    const perms = req.user.permissions || {};
    const permKey = entityType === "Person" ? "editContacts" : entityType === "GramPanchayat" ? "editGramPanchayats" : "suggestChanges";
    if (perms[permKey] === false) {
      return res.status(403).json({ error: "You don't have permission to submit this type of proposal" });
    }
  }

  if (req.body.action) return createActionChangeRequest(req, res);

  if (!proposedChanges || typeof proposedChanges !== "object" || Object.keys(proposedChanges).length === 0) {
    return res.status(400).json({ error: "proposedChanges must be a non-empty object" });
  }

  const editableFields = entityType === "Person" ? PERSON_EDITABLE_FIELDS : entityType === "GramPanchayat" ? GP_EDITABLE_FIELDS : GENERAL_EDITABLE_FIELDS;
  const cleanedChanges = {};
  for (const key of Object.keys(proposedChanges)) {
    if (editableFields.includes(key) && proposedChanges[key] !== undefined && proposedChanges[key] !== "") {
      cleanedChanges[key] = proposedChanges[key];
    }
  }
  if (entityType === "GramPanchayat" && "contacts" in cleanedChanges) {
    // Contacts travel with a NEW GP proposal only (existing GPs use the normal contact flow).
    if (entityId || !Array.isArray(cleanedChanges.contacts) || cleanedChanges.contacts.length === 0) {
      delete cleanedChanges.contacts;
    } else {
      const prepared = await prepareGpContacts(cleanedChanges.contacts);
      if (prepared.error) return res.status(prepared.status).json({ error: prepared.error });
      cleanedChanges.contacts = prepared.contacts.map(({ phoneNormalized, ...c }) => c);
    }
  }
  if (Object.keys(cleanedChanges).length === 0) {
    return res.status(400).json({ error: "No recognized fields to propose a change for" });
  }

  let previousValues = {};
  let isNewEntity = entityType === "General" ? false : !entityId;

  if (entityId) {
    if (entityType === "General") {
      return res.status(400).json({ error: "General change suggestions do not target a live record" });
    }
    const Model = entityType === "Person" ? Person : GramPanchayat;
    const existing = await Model.findById(entityId);
    if (!existing) return res.status(404).json({ error: "Not found" });
    previousValues = Object.fromEntries(Object.keys(cleanedChanges).map((k) => [k, existing[k] ?? null]));
  }

  // For a brand-new GP, validate the full registration-style custom fields
  // here rather than trusting the employee browser.
  if (entityType === "GramPanchayat" && cleanedChanges.customFields) {
    const fieldDefs = await FormFieldConfig.find({ target: "gramPanchayat", active: true }).sort({ order: 1 });
    const { errors, values } = validateDynamicFieldValues(fieldDefs, cleanedChanges.customFields);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });
    cleanedChanges.customFields = values;
  }

  if (entityType === "General") {
    if (!cleanedChanges.title || String(cleanedChanges.title).trim().length < 3) {
      return res.status(400).json({ error: "A change suggestion needs a clear title" });
    }
    if (!cleanedChanges.details || String(cleanedChanges.details).trim().length < 10) {
      return res.status(400).json({ error: "Please explain the requested change in at least a few words" });
    }
    if (cleanedChanges.metadata && (typeof cleanedChanges.metadata !== "object" || Array.isArray(cleanedChanges.metadata))) {
      return res.status(400).json({ error: "metadata must be an object when provided" });
    }
  }

  // gramPanchayatId only makes sense for a Person suggestion - it's how the
  // new contact ends up actually linked (via PersonAssignment) to the
  // Grampanchayat the employee met them at, once an admin approves this.
  let resolvedGramPanchayatId;
  if (entityType === "Person" && gramPanchayatId) {
    const gp = await GramPanchayat.findById(gramPanchayatId).select("_id");
    if (!gp) return res.status(400).json({ error: "That Grampanchayat doesn't exist" });
    resolvedGramPanchayatId = gp._id;
  }

  const changeRequest = await ChangeRequest.create({
    entityType,
    entityId: entityId || null,
    isNewEntity,
    gramPanchayatId: resolvedGramPanchayatId || undefined,
    proposedChanges: cleanedChanges,
    previousValues,
    reason,
    relatedActivityLogId: relatedActivityLogId || undefined,
    proposedBy: req.user.id,
    status: "pending",
  });

  await changeRequest.populate("proposedBy", "name");
  await changeRequest.populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr");
  emitToAdmins("changeRequest:new", changeRequest);
  if (req.user.role !== "admin") {
    await createAdminNotification({
      type: "change_request",
      section: "approvals",
      title: entityType === "General"
        ? `New change suggestion${cleanedChanges.title ? `: ${String(cleanedChanges.title).trim().slice(0, 72)}` : ""}`
        : (changeRequest.isNewEntity ? `New ${entityType === "Person" ? "contact" : "Grampanchayat"} proposal` : `${entityType === "Person" ? "Contact" : "Grampanchayat"} change proposal`),
      message: entityType === "General"
        ? `${changeRequest.proposedBy?.name || "An employee"} suggested a change for ${cleanedChanges.targetArea || "the system"}.`
        : `${changeRequest.proposedBy?.name || "An employee"} submitted a ${changeRequest.isNewEntity ? "new-record proposal" : "change proposal"}.`,
      link: "/admin/approvals",
      sourceId: changeRequest._id,
    });
  }
  return res.status(201).json({ changeRequest });
});

// Workplace-change and contact-replacement proposals. Same queue, same
// approval step, same permission gate (editContacts) as every other Person
// proposal - they only differ in what approval does. Everything shown to the
// reviewer (old/new contact, old/new GP) is snapshotted from the database
// here, never taken from what the browser claims.
async function createActionChangeRequest(req, res) {
  const { action, entityId, gramPanchayatId, previousGramPanchayatId, replacesPersonId, proposedChanges, reason, relatedActivityLogId } = req.body;

  if (req.body.entityType !== "Person") {
    return res.status(400).json({ error: "This kind of proposal must target a contact" });
  }
  if (!["replace_contact", "change_workplace"].includes(action)) {
    return res.status(400).json({ error: "Unknown proposal action" });
  }
  const isId = (v) => mongoose.isValidObjectId(v);
  if (!isId(gramPanchayatId)) return res.status(400).json({ error: "A Grampanchayat is required" });
  const gp = await GramPanchayat.findById(gramPanchayatId).select("name nameMr taluka talukaMr");
  if (!gp) return res.status(400).json({ error: "That Grampanchayat doesn't exist" });

  let doc;

  if (action === "change_workplace") {
    if (!isId(entityId)) return res.status(400).json({ error: "A contact is required" });
    const person = await Person.findById(entityId);
    if (!person) return res.status(404).json({ error: "Contact not found" });

    let oldGp = null;
    if (previousGramPanchayatId) {
      if (!isId(previousGramPanchayatId)) return res.status(400).json({ error: "Invalid current Grampanchayat" });
      if (String(previousGramPanchayatId) === String(gp._id)) {
        return res.status(400).json({ error: "The proposed Grampanchayat is the same as the current one" });
      }
      const current = await PersonAssignment.findOne({ personId: person._id, gramPanchayatId: previousGramPanchayatId, toDate: null });
      if (!current) return res.status(400).json({ error: "This contact is not currently posted at that Grampanchayat" });
      oldGp = await GramPanchayat.findById(previousGramPanchayatId).select("name nameMr taluka talukaMr");
    }
    if (await PersonAssignment.findOne({ personId: person._id, gramPanchayatId: gp._id, toDate: null })) {
      return res.status(409).json({ error: "This contact already works at the proposed Grampanchayat" });
    }
    const pending = await ChangeRequest.findOne({ action, entityId: person._id, gramPanchayatId: gp._id, status: "pending" });
    if (pending) return res.status(409).json({ error: "A workplace change to this Grampanchayat is already awaiting review" });

    doc = {
      entityType: "Person",
      entityId: person._id,
      isNewEntity: false,
      gramPanchayatId: gp._id,
      proposedChanges: { workplace: gpLabel(gp) },
      previousValues: { contact: contactLabel(person), workplace: gpLabel(oldGp), gramPanchayatId: oldGp?._id || null },
    };
  } else {
    if (!isId(replacesPersonId)) return res.status(400).json({ error: "The contact being replaced is required" });
    const oldAssignment = await PersonAssignment.findOne({ personId: replacesPersonId, gramPanchayatId: gp._id, toDate: null })
      .populate("personId", "name nameMr phone designation");
    if (!oldAssignment?.personId) {
      return res.status(400).json({ error: "That person is not a current contact of this Grampanchayat" });
    }
    const oldPerson = oldAssignment.personId;
    const previousValues = {
      name: oldPerson.name ?? null, nameMr: oldPerson.nameMr ?? null,
      designation: oldPerson.designation ?? null, phone: oldPerson.phone ?? null,
      replacesPersonId: oldPerson._id,
    };

    if (entityId) {
      // Replacement is someone already in the directory.
      if (!isId(entityId)) return res.status(400).json({ error: "Invalid replacement contact" });
      if (String(entityId) === String(oldPerson._id)) return res.status(400).json({ error: "The replacement must be a different person" });
      const person = await Person.findById(entityId);
      if (!person) return res.status(404).json({ error: "Replacement contact not found" });
      if (await PersonAssignment.findOne({ personId: person._id, gramPanchayatId: gp._id, toDate: null })) {
        return res.status(409).json({ error: "That person is already a current contact of this Grampanchayat" });
      }
      doc = {
        entityType: "Person", entityId: person._id, isNewEntity: false, gramPanchayatId: gp._id, previousValues,
        // Display-only snapshot - approving a replacement never edits this person's record.
        proposedChanges: { name: person.name ?? person.nameMr, nameMr: person.nameMr ?? null, designation: person.designation, phone: person.phone ?? null },
      };
    } else {
      // Replacement is a person who isn't in the directory yet.
      const cleaned = {};
      for (const key of Object.keys(proposedChanges || {})) {
        if (PERSON_EDITABLE_FIELDS.includes(key) && proposedChanges[key] !== undefined && proposedChanges[key] !== "") cleaned[key] = proposedChanges[key];
      }
      if (!cleaned.name || !Person.DESIGNATIONS.includes(cleaned.designation)) {
        return res.status(400).json({ error: "Pick an existing contact, or provide a name and designation for the new person" });
      }
      const normalizedPhone = normalizePhone(cleaned.phone);
      if (normalizedPhone && (await Person.findOne({ phone: normalizedPhone }))) {
        return res.status(409).json({ error: "A contact with this phone number already exists - pick them as the replacement instead" });
      }
      doc = { entityType: "Person", entityId: null, isNewEntity: true, gramPanchayatId: gp._id, previousValues, proposedChanges: cleaned };
    }

    const pending = await ChangeRequest.findOne({ action, gramPanchayatId: gp._id, "previousValues.replacesPersonId": oldPerson._id, status: "pending" });
    if (pending) return res.status(409).json({ error: "A replacement for this contact is already awaiting review" });
  }

  const changeRequest = await ChangeRequest.create({
    ...doc,
    action,
    reason,
    relatedActivityLogId: relatedActivityLogId || undefined,
    proposedBy: req.user.id,
    status: "pending",
  });

  await changeRequest.populate("proposedBy", "name");
  await changeRequest.populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr");
  emitToAdmins("changeRequest:new", changeRequest);
  if (req.user.role !== "admin") {
    await createAdminNotification({
      type: "change_request",
      section: "approvals",
      title: action === "change_workplace" ? "Workplace change proposal" : "Contact replacement proposal",
      message: `${changeRequest.proposedBy?.name || "An employee"} proposed ${action === "change_workplace" ? "a workplace change" : "replacing a Grampanchayat contact"}.`,
      link: "/admin/approvals",
      sourceId: changeRequest._id,
    });
  }
  return res.status(201).json({ changeRequest });
}

// GET /api/change-requests?status=&page=&limit= - admin only
const listChangeRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = status ? { status } : {};

  const [changeRequests, total] = await Promise.all([
    ChangeRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("proposedBy", "name")
      .populate("reviewedBy", "name")
      .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr"),
    ChangeRequest.countDocuments(filter),
  ]);

  return res.json({ changeRequests, pagination: buildPaginationMeta(page, limit, total) });
});


// GET /api/change-requests/:id - admin only - everything needed to review one
// request intelligently: the request itself, the live record(s) it touches,
// current/past postings, the related activity, entity history, stale-field
// detection and (for a contact with a GP) whether approving would replace
// a single-holder.
const getChangeRequestDetail = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid request id" });
  const cr = await ChangeRequest.findById(req.params.id)
    .populate("proposedBy", "name email team")
    .populate("reviewedBy", "name")
    .populate("editHistory.editedBy", "name")
    .populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr")
    .lean();
  if (!cr) return res.status(404).json({ error: "Not found" });

  const out = { changeRequest: cr, currentEntity: null, assignments: [], history: [], relatedActivity: null, staleFields: [], holderConflict: null, replacesPerson: null, fromGramPanchayat: null, currentContacts: [] };

  const prev = cr.previousValues || {};
  const tasks = [];

  if (cr.entityId && cr.entityType === "Person") {
    tasks.push(Person.findById(cr.entityId).lean().then((p) => { out.currentEntity = p; }));
    tasks.push(PersonAssignment.find({ personId: cr.entityId }).sort({ fromDate: -1 }).populate("gramPanchayatId", "name nameMr taluka talukaMr district districtMr").lean().then((a) => { out.assignments = a; }));
  } else if (cr.entityId && cr.entityType === "GramPanchayat") {
    tasks.push(GramPanchayat.findById(cr.entityId).lean().then((g) => { out.currentEntity = g; }));
  }
  if (cr.entityId && cr.entityType !== "General") {
    tasks.push(ChangeHistory.find({ entityType: cr.entityType, entityId: cr.entityId }).sort({ createdAt: -1 }).limit(50).populate("changedBy", "name").lean().then((h) => { out.history = h; }));
  }
  // Contacts currently/formerly posted at the GP the request is about.
  const gpId = cr.gramPanchayatId?._id || (cr.entityType === "GramPanchayat" ? cr.entityId : null);
  if (gpId) {
    tasks.push(PersonAssignment.find({ gramPanchayatId: gpId }).sort({ toDate: 1, fromDate: -1 }).limit(60).populate("personId", "name nameMr phone designation designationMr").lean().then((a) => { out.currentContacts = a; }));
  }
  if (cr.action === "replace_contact" && prev.replacesPersonId) {
    tasks.push(Person.findById(prev.replacesPersonId).lean().then((p) => { out.replacesPerson = p; }));
  }
  if (cr.action === "change_workplace" && prev.gramPanchayatId) {
    tasks.push(GramPanchayat.findById(prev.gramPanchayatId).select("name nameMr taluka talukaMr district districtMr").lean().then((g) => { out.fromGramPanchayat = g; }));
  }
  if (cr.relatedActivityLogId) {
    tasks.push(ActivityLog.findById(cr.relatedActivityLogId).populate("employeeId", "name").populate("gramPanchayatId", "name nameMr taluka talukaMr").populate("personId", "name nameMr designation").lean().then((a) => { out.relatedActivity = a; }));
  }
  await Promise.all(tasks);

  if (cr.status === "pending") {
    out.staleFields = staleFieldsFor(cr, out.currentEntity);
    const designation = cr.proposedChanges?.designation || out.currentEntity?.designation;
    if (cr.entityType === "Person" && cr.gramPanchayatId && designation && !cr.action) {
      const conflict = await findHolderConflict({ gramPanchayatId: cr.gramPanchayatId._id, designation, excludePersonId: cr.entityId || undefined });
      if (conflict) out.holderConflict = { person: conflict.personId, designation };
    }
  }
  return res.json(out);
});

// PATCH /api/change-requests/:id - admin only
//
// Lets an admin correct what an employee proposed - not just accept or
// reject it as-is - before it's approved into the real record. Only valid
// while the request is still pending.
const updateChangeRequest = asyncHandler(async (req, res) => {
  const { proposedChanges } = req.body;
  if (!proposedChanges || typeof proposedChanges !== "object" || Object.keys(proposedChanges).length === 0) {
    return res.status(400).json({ error: "proposedChanges must be a non-empty object" });
  }

  const changeRequest = await ChangeRequest.findById(req.params.id);
  if (!changeRequest) return res.status(404).json({ error: "Not found" });
  if (changeRequest.status !== "pending") {
    return res.status(409).json({ error: "This request has already been reviewed" });
  }

  const editError = applyAdminEdits(changeRequest, proposedChanges, req.user.id);
  if (editError) return res.status(400).json({ error: editError });
  if (changeRequest.entityType === "GramPanchayat" && changeRequest.proposedChanges?.contacts) {
    const prepared = await prepareGpContacts(changeRequest.proposedChanges.contacts);
    if (prepared.error) return res.status(prepared.status).json({ error: prepared.error });
  }
  await changeRequest.save();

  emitToAdmins("changeRequest:updated", changeRequest);
  return res.json({ changeRequest });
});

// POST /api/change-requests/:id/approve - admin only
//
// Applies the proposed changes to the real record (creating it first, for
// a brand-new-contact proposal), logs every changed field to
// ChangeHistory with source "approved_request", and marks the request
// resolved. A phone change goes through the same previousPhones handling
// as a direct edit, so nothing about "how a phone number changes" differs
// based on whether it came through approval or not.
//
// When the request carries a gramPanchayatId (an employee suggested this
// contact while logging an activity at that Grampanchayat), approving also
// creates the PersonAssignment linking them there - without this, a newly
// approved contact would exist in the directory but never show up when
// anyone filters contacts by that Grampanchayat, which defeats the point
// of suggesting them in the first place. Uses the same single-holder guard
// as adding a contact directly: if someone else already holds that
// designation there, this returns 409 asking for `confirmReplaceHolder`.
const approveChangeRequest = asyncHandler(async (req, res) => {
  const changeRequest = await ChangeRequest.findById(req.params.id);
  if (!changeRequest) return res.status(404).json({ error: "Not found" });
  if (changeRequest.status !== "pending") {
    return res.status(409).json({ error: "This request has already been reviewed" });
  }

  // An admin can tweak the proposed values right at approval time (e.g.
  // fix a typo) instead of needing a separate edit step first - `edits`
  // overrides individual fields on top of what the employee proposed.
  const { edits, confirmReplaceHolder, confirmStale } = req.body;
  if (edits && typeof edits === "object") {
    const editError = applyAdminEdits(changeRequest, edits, req.user.id);
    if (editError) return res.status(400).json({ error: editError });
  }
  if (changeRequest.entityType === "Person") {
    const validationError = validatePersonFields(changeRequest.proposedChanges);
    if (validationError) return res.status(400).json({ error: validationError });
  }

  // Don't silently overwrite newer data: if the live record changed since the
  // employee proposed, the admin has to explicitly confirm.
  if (changeRequest.entityId && !changeRequest.isNewEntity && !changeRequest.action && changeRequest.entityType !== "General") {
    const LiveModel = changeRequest.entityType === "Person" ? Person : GramPanchayat;
    const live = await LiveModel.findById(changeRequest.entityId).lean();
    const stale = staleFieldsFor(changeRequest, live);
    if (stale.length && !confirmStale) {
      return res.status(409).json({
        error: "STALE_REQUEST",
        requiresStaleConfirmation: true,
        staleFields: stale,
        message: "This record was changed after the request was submitted. Review the current values, then confirm to apply anyway.",
      });
    }
  }

  const historySource = changeRequest.editHistory?.length ? "approved_edited_request" : "approved_request";

  const changes = changeRequest.proposedChanges;
  let resultEntity;
  let assignment;
  let replacedHolder;
  let createdContacts = [];

  if (changeRequest.entityType === "General") {
    // General suggestions are intentionally review-only: approving records
    // that an admin accepted the suggestion, but does not blindly mutate an
    // unknown resource. The admin can act on the request using the captured
    // title/details/context.
    resultEntity = null;
  } else if (changeRequest.action === "change_workplace") {
    // Move a contact between Grampanchayats: close the posting at the old GP,
    // open one at the new GP, and record old -> new on the contact's history.
    // Same single-holder rule as a direct transfer.
    const person = await Person.findById(changeRequest.entityId);
    if (!person) return res.status(404).json({ error: "The contact this request was about no longer exists" });
    const newGpId = changeRequest.gramPanchayatId;
    const newGp = newGpId ? await GramPanchayat.findById(newGpId).select("name nameMr taluka talukaMr") : null;
    if (!newGp) return res.status(404).json({ error: "The proposed Grampanchayat no longer exists" });
    const oldGpId = changeRequest.previousValues?.gramPanchayatId || null;

    if (await PersonAssignment.findOne({ personId: person._id, gramPanchayatId: newGp._id, toDate: null })) {
      return res.status(409).json({ error: "This contact already works at the proposed Grampanchayat" });
    }
    if (oldGpId && !(await PersonAssignment.findOne({ personId: person._id, gramPanchayatId: oldGpId, toDate: null }))) {
      return res.status(409).json({ error: "This contact is no longer posted at the Grampanchayat this request moves them from - reject it and ask for a new proposal" });
    }

    const conflict = await findHolderConflict({ gramPanchayatId: newGp._id, designation: person.designation, excludePersonId: person._id });
    if (conflict && !confirmReplaceHolder) {
      return res.status(409).json({
        error: "ALREADY_HAS_HOLDER",
        requiresConfirmation: true,
        conflict: { assignmentId: conflict._id, person: conflict.personId, designation: person.designation },
        message: `${conflict.personId?.name || "Someone"} is already recorded as the ${person.designation} at that Grampanchayat. Approving this will move that person to past contacts.`,
      });
    }
    if (conflict && confirmReplaceHolder) {
      replacedHolder = conflict.personId;
      await replaceHolder({ conflict, gramPanchayatId: newGp._id, designation: person.designation, newPerson: person, changedBy: req.user.id });
    }

    if (oldGpId) {
      await PersonAssignment.updateMany({ personId: person._id, gramPanchayatId: oldGpId, toDate: null }, { toDate: new Date() });
    }
    assignment = await PersonAssignment.create({
      personId: person._id,
      gramPanchayatId: newGp._id,
      designationAtAssignment: person.designation,
      fromDate: new Date(),
      toDate: null,
    });
    await ChangeHistory.create({
      entityType: "Person",
      entityId: person._id,
      field: "workplace",
      oldValue: changeRequest.previousValues?.workplace || null,
      newValue: gpLabel(newGp),
      changedBy: req.user.id,
      source: historySource,
    });
    resultEntity = person;
    emitToAdmins("person:transferred", { personId: person._id, assignment });
  } else if (changeRequest.action === "replace_contact") {
    // Swap a GP's current contact: close the old contact's posting here, open
    // one for the replacement (creating the person first if they're new), and
    // record "old contact -> new contact" on the Grampanchayat's history.
    const gpId = changeRequest.gramPanchayatId;
    const oldPersonId = changeRequest.previousValues?.replacesPersonId;
    const oldAssignment = oldPersonId && gpId
      ? await PersonAssignment.findOne({ personId: oldPersonId, gramPanchayatId: gpId, toDate: null }).populate("personId", "name nameMr phone designation")
      : null;
    if (!oldAssignment) {
      return res.status(409).json({ error: "The contact being replaced is no longer a current contact of this Grampanchayat - reject this request and ask for a new proposal" });
    }

    let newPerson;
    let normalizedPhone;
    if (changeRequest.isNewEntity) {
      if (!changes.name || !changes.designation) {
        return res.status(400).json({ error: "Cannot create a contact without at least a name and designation" });
      }
      normalizedPhone = normalizePhone(changes.phone);
      if (normalizedPhone && (await Person.findOne({ phone: normalizedPhone }))) {
        return res.status(409).json({ error: "A contact with this phone number already exists - reject this and re-submit with that person as the replacement" });
      }
    } else {
      newPerson = await Person.findById(changeRequest.entityId);
      if (!newPerson) return res.status(404).json({ error: "The replacement contact no longer exists" });
      if (await PersonAssignment.findOne({ personId: newPerson._id, gramPanchayatId: gpId, toDate: null })) {
        return res.status(409).json({ error: "The replacement is already a current contact of this Grampanchayat" });
      }
    }

    // The outgoing contact is being closed anyway, so only a *different*
    // current holder of the same single-holder role needs confirming.
    const newDesignation = newPerson ? newPerson.designation : changes.designation;
    const conflict = await findHolderConflict({ gramPanchayatId: gpId, designation: newDesignation, excludePersonId: oldAssignment.personId._id });
    if (conflict && !confirmReplaceHolder) {
      return res.status(409).json({
        error: "ALREADY_HAS_HOLDER",
        requiresConfirmation: true,
        conflict: { assignmentId: conflict._id, person: conflict.personId, designation: newDesignation },
        message: `${conflict.personId?.name || "Someone"} is already recorded as the ${newDesignation} at this Grampanchayat. Approving this will move that person to past contacts as well.`,
      });
    }

    if (changeRequest.isNewEntity) {
      newPerson = await Person.create(buildPersonDoc(changes, normalizedPhone));
      await logFieldChanges({
        entityType: "Person", entityId: newPerson._id, before: {}, updates: changes,
        changedBy: req.user.id, source: historySource,
      });
      emitToAdmins("person:new", newPerson);
    }
    if (conflict && confirmReplaceHolder) {
      replacedHolder = conflict.personId;
      await replaceHolder({ conflict, gramPanchayatId: gpId, designation: newDesignation, newPerson, changedBy: req.user.id });
    }

    const oldPerson = oldAssignment.personId;
    oldAssignment.toDate = new Date();
    await oldAssignment.save();
    assignment = await PersonAssignment.create({
      personId: newPerson._id,
      gramPanchayatId: gpId,
      designationAtAssignment: newPerson.designation,
      fromDate: new Date(),
      toDate: null,
    });
    await ChangeHistory.create({
      entityType: "GramPanchayat",
      entityId: gpId,
      field: "contact",
      oldValue: contactLabel(oldPerson),
      newValue: contactLabel(newPerson),
      changedBy: req.user.id,
      source: historySource,
    });
    resultEntity = newPerson;
    emitToAdmins("person:transferred", { personId: newPerson._id, assignment });
  } else if (changeRequest.entityType === "Person") {
    if (changeRequest.isNewEntity) {
      if (!changes.name || !changes.designation) {
        return res.status(400).json({ error: "Cannot create a contact without at least a name and designation" });
      }
      const normalizedPhone = normalizePhone(changes.phone);
      if (normalizedPhone) {
        const existingByPhone = await Person.findOne({ phone: normalizedPhone });
        if (existingByPhone) {
          return res.status(409).json({ error: "A contact with this phone number already exists - link this request to them instead" });
        }
      }
      resultEntity = await Person.create(buildPersonDoc(changes, normalizedPhone));
      await logFieldChanges({
        entityType: "Person",
        entityId: resultEntity._id,
        before: {},
        updates: changes,
        changedBy: req.user.id,
        source: historySource,
      });

      // Link the new contact to the Grampanchayat they were suggested at.
      if (changeRequest.gramPanchayatId) {
        const conflict = await findHolderConflict({
          gramPanchayatId: changeRequest.gramPanchayatId,
          designation: resultEntity.designation,
          excludePersonId: resultEntity._id,
        });
        if (conflict && !confirmReplaceHolder) {
          // Roll back the just-created Person so approving doesn't leave an
          // orphan contact if the admin cancels out of the conflict prompt.
          await Person.findByIdAndDelete(resultEntity._id);
          return res.status(409).json({
            error: "ALREADY_HAS_HOLDER",
            requiresConfirmation: true,
            conflict: { assignmentId: conflict._id, person: conflict.personId, designation: resultEntity.designation },
            message: `${conflict.personId?.name || "Someone"} is already recorded as the ${resultEntity.designation} at that Grampanchayat. Approving this will move that person to past contacts.`,
          });
        }
        if (conflict && confirmReplaceHolder) {
          replacedHolder = conflict.personId;
          await replaceHolder({
            conflict, gramPanchayatId: changeRequest.gramPanchayatId, designation: resultEntity.designation,
            newPerson: resultEntity, changedBy: req.user.id,
          });
        }
        assignment = await PersonAssignment.create({
          personId: resultEntity._id,
          gramPanchayatId: changeRequest.gramPanchayatId,
          designationAtAssignment: resultEntity.designation,
          fromDate: new Date(),
          toDate: null,
        });
      }
    } else {
      const before = await Person.findById(changeRequest.entityId);
      if (!before) return res.status(404).json({ error: "The contact this request was about no longer exists" });

      const setFields = { ...changes };
      let pushOp;
      if ("phone" in changes) {
        const normalizedPhone = normalizePhone(changes.phone);
        if (normalizedPhone && normalizedPhone !== before.phone) {
          if (before.phone) pushOp = { previousPhones: { number: before.phone, replacedAt: new Date() } };
          setFields.phone = normalizedPhone;
        } else {
          delete setFields.phone;
        }
      }

      resultEntity = await Person.findByIdAndUpdate(
        changeRequest.entityId,
        pushOp ? { $set: setFields, $push: pushOp } : { $set: setFields },
        { new: true }
      );
      await logFieldChanges({
        entityType: "Person",
        entityId: resultEntity._id,
        before,
        updates: setFields,
        changedBy: req.user.id,
        source: historySource,
      });

      // A confirm/correct request on an existing contact can also carry a
      // gramPanchayatId (e.g. the employee met them somewhere new) - link
      // it if they aren't already posted there, same conflict handling.
      if (changeRequest.gramPanchayatId) {
        const alreadyLinked = await PersonAssignment.findOne({
          personId: resultEntity._id, gramPanchayatId: changeRequest.gramPanchayatId, toDate: null,
        });
        if (!alreadyLinked) {
          const conflict = await findHolderConflict({
            gramPanchayatId: changeRequest.gramPanchayatId,
            designation: resultEntity.designation,
            excludePersonId: resultEntity._id,
          });
          if (conflict && !confirmReplaceHolder) {
            return res.status(409).json({
              error: "ALREADY_HAS_HOLDER",
              requiresConfirmation: true,
              conflict: { assignmentId: conflict._id, person: conflict.personId, designation: resultEntity.designation },
              message: `${conflict.personId?.name || "Someone"} is already recorded as the ${resultEntity.designation} at that Grampanchayat. Approving this will move that person to past contacts.`,
            });
          }
          if (conflict && confirmReplaceHolder) {
            replacedHolder = conflict.personId;
            await replaceHolder({
              conflict, gramPanchayatId: changeRequest.gramPanchayatId, designation: resultEntity.designation,
              newPerson: resultEntity, changedBy: req.user.id,
            });
          }
          assignment = await PersonAssignment.create({
            personId: resultEntity._id,
            gramPanchayatId: changeRequest.gramPanchayatId,
            designationAtAssignment: resultEntity.designation,
            fromDate: new Date(),
            toDate: null,
          });
        }
      }
    }
    emitToAdmins(changeRequest.isNewEntity ? "person:new" : "person:updated", resultEntity);
    if (assignment) emitToAdmins("person:transferred", { personId: resultEntity._id, assignment });
  } else {
    // GramPanchayat: employees can either propose changes to an existing GP
    // or submit a complete new GP registration-style record. Approval is the
    // only point where the proposal touches the live directory.
    if (changeRequest.isNewEntity) {
      if (!changes.name || !changes.taluka || !changes.district) {
        return res.status(400).json({ error: "A new Grampanchayat requires name, taluka, and district" });
      }
      const nameKey = normalizeName(changes.name);
      const duplicate = await GramPanchayat.findOne({ nameKey, taluka: String(changes.taluka).trim() });
      if (duplicate) {
        return res.status(409).json({ error: "A Grampanchayat with this name and taluka already exists - select it from the directory instead" });
      }

      // Validate contacts before anything is written (same rules as everywhere else).
      const preparedContacts = await prepareGpContacts(changes.contacts);
      if (preparedContacts.error) return res.status(preparedContacts.status).json({ error: preparedContacts.error });

      resultEntity = await GramPanchayat.create({
        name: changes.name,
        nameMr: changes.nameMr,
        nameKey,
        mukamPost: changes.mukamPost,
        taluka: String(changes.taluka).trim(),
        district: String(changes.district).trim(),
        pincode: changes.pincode,
        population: changes.population === "" || changes.population == null ? undefined : Number(changes.population),
        numberOfHouseholds: changes.numberOfHouseholds === "" || changes.numberOfHouseholds == null ? undefined : Number(changes.numberOfHouseholds),
        officePhone: changes.officePhone,
        officeEmail: changes.officeEmail,
        gpType: changes.gpType || undefined,
        waterSupplyMode: changes.waterSupplyMode || undefined,
        reassessmentYearFrom: changes.reassessmentYearFrom,
        reassessmentYearTo: changes.reassessmentYearTo,
        taxRates: Array.isArray(changes.taxRates) && changes.taxRates.length ? changes.taxRates : GramPanchayat.DEFAULT_TAX_RATES,
        constructionRates: Array.isArray(changes.constructionRates) && changes.constructionRates.length ? changes.constructionRates : GramPanchayat.DEFAULT_CONSTRUCTION_RATES,
        landRates: Array.isArray(changes.landRates) && changes.landRates.length ? changes.landRates : GramPanchayat.DEFAULT_LAND_RATES,
        customFields: changes.customFields && Object.keys(changes.customFields).length ? changes.customFields : undefined,
        isUsingOurSoftware: Boolean(changes.isUsingOurSoftware),
        previousSoftwareUsed: changes.previousSoftwareUsed,
        softwareStartDate: changes.softwareStartDate ? new Date(changes.softwareStartDate) : undefined,
        subscriptionEndDate: changes.subscriptionEndDate ? new Date(changes.subscriptionEndDate) : undefined,
        subscriptionYears: changes.subscriptionYears === "" || changes.subscriptionYears == null ? undefined : Number(changes.subscriptionYears),
        priceAmount: changes.priceAmount === "" || changes.priceAmount == null ? undefined : Number(changes.priceAmount),
        paymentMode: changes.paymentMode || undefined,
        status: changes.status || "prospect",
      });
      const { contacts: _contacts, ...gpOnlyChanges } = changes;
      try {
        if (preparedContacts.contacts.length) {
          const created = await createGpContacts({ gramPanchayat: resultEntity, contacts: preparedContacts.contacts, userId: req.user.id, source: historySource });
          createdContacts = created.people;
          assignment = created.assignments;
        }
      } catch (err) {
        await GramPanchayat.findByIdAndDelete(resultEntity._id);
        return res.status(409).json({ error: `Could not add the contacts, nothing was created: ${err.message}` });
      }
      await logFieldChanges({
        entityType: "GramPanchayat",
        entityId: resultEntity._id,
        before: {},
        updates: gpOnlyChanges,
        changedBy: req.user.id,
        source: historySource,
      });
      emitToAdmins("gramPanchayat:new", resultEntity);
      createdContacts.forEach((p) => emitToAdmins("person:new", p));
    } else {
      const before = await GramPanchayat.findById(changeRequest.entityId);
      if (!before) return res.status(404).json({ error: "The Grampanchayat this request was about no longer exists" });

      const updates = { ...changes };
      if ("name" in updates) updates.nameKey = normalizeName(updates.name);
      if ("isUsingOurSoftware" in updates || "softwareStartDate" in updates) {
        const usingSoftware = "isUsingOurSoftware" in updates ? Boolean(updates.isUsingOurSoftware) : before.isUsingOurSoftware;
        const startDate = "softwareStartDate" in updates ? (updates.softwareStartDate ? new Date(updates.softwareStartDate) : null) : before.softwareStartDate;
        updates.softwareUsageStatus = usingSoftware ? (startDate ? "active" : "active") : (startDate ? "churned" : "never_used");
      }
      if ("softwareStartDate" in updates && updates.softwareStartDate) updates.softwareStartDate = new Date(updates.softwareStartDate);
      if ("subscriptionEndDate" in updates && updates.subscriptionEndDate) updates.subscriptionEndDate = new Date(updates.subscriptionEndDate);
      if ("population" in updates && updates.population !== "") updates.population = Number(updates.population);
      if ("numberOfHouseholds" in updates && updates.numberOfHouseholds !== "") updates.numberOfHouseholds = Number(updates.numberOfHouseholds);
      if ("subscriptionYears" in updates && updates.subscriptionYears !== "") updates.subscriptionYears = Number(updates.subscriptionYears);
      if ("priceAmount" in updates && updates.priceAmount !== "") updates.priceAmount = Number(updates.priceAmount);

      resultEntity = await GramPanchayat.findByIdAndUpdate(changeRequest.entityId, updates, { new: true });
      await logFieldChanges({
        entityType: "GramPanchayat",
        entityId: resultEntity._id,
        before,
        updates,
        changedBy: req.user.id,
        source: historySource,
      });
      emitToAdmins("gramPanchayat:updated", resultEntity);
    }
  }

  changeRequest.finalChanges = changeRequest.proposedChanges;
  changeRequest.markModified("finalChanges");
  changeRequest.status = "approved";
  if (req.body.reviewNote) changeRequest.reviewNote = req.body.reviewNote;
  changeRequest.reviewedBy = req.user.id;
  changeRequest.reviewedAt = new Date();
  if (changeRequest.entityType !== "General" && changeRequest.isNewEntity && resultEntity?._id) changeRequest.entityId = resultEntity._id;
  await changeRequest.save();

  emitToAdmins("changeRequest:updated", changeRequest);
  return res.json({ changeRequest, entity: resultEntity, assignment, replacedHolder });
});

// POST /api/change-requests/:id/reject - admin only
const rejectChangeRequest = asyncHandler(async (req, res) => {
  const { reviewNote } = req.body;
  const changeRequest = await ChangeRequest.findById(req.params.id);
  if (!changeRequest) return res.status(404).json({ error: "Not found" });
  if (changeRequest.status !== "pending") {
    return res.status(409).json({ error: "This request has already been reviewed" });
  }

  changeRequest.status = "rejected";
  changeRequest.reviewedBy = req.user.id;
  changeRequest.reviewedAt = new Date();
  changeRequest.reviewNote = reviewNote;
  await changeRequest.save();

  emitToAdmins("changeRequest:updated", changeRequest);
  return res.json({ changeRequest });
});

module.exports = { createChangeRequest, listChangeRequests, getChangeRequestDetail, updateChangeRequest, approveChangeRequest, rejectChangeRequest };
