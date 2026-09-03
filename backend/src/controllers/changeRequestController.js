const ChangeRequest = require("../models/ChangeRequest");
const Person = require("../models/Person");
const GramPanchayat = require("../models/GramPanchayat");
const { validateDynamicFieldValues } = require("../utils/dynamicFields");
const FormFieldConfig = require("../models/FormFieldConfig");
const PersonAssignment = require("../models/PersonAssignment");
const { normalizeName, normalizePhone } = require("../utils/normalize");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");
const { logFieldChanges } = require("../utils/diffFields");
const { findHolderConflict, replaceHolder } = require("../utils/singleHolderGuard");
const { createAdminNotification } = require("./notificationController");

const PERSON_EDITABLE_FIELDS = ["name", "nameMr", "designation", "phone", "email", "address", "addressMr", "district", "notes"];
const GENERAL_EDITABLE_FIELDS = ["category", "targetArea", "title", "details", "requestedOutcome", "urgency", "page", "referenceId", "metadata"];
const GP_EDITABLE_FIELDS = [
  "name", "nameMr", "mukamPost", "taluka", "district", "pincode",
  "officePhone", "officeEmail", "population", "numberOfHouseholds", "gpType", "waterSupplyMode",
  "reassessmentYearFrom", "reassessmentYearTo", "taxRates",
  "constructionRates", "landRates", "customFields",
  "isUsingOurSoftware", "previousSoftwareUsed", "softwareStartDate",
  "subscriptionEndDate", "subscriptionYears", "priceAmount", "paymentMode", "status",
];

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
  await changeRequest.populate("gramPanchayatId", "name taluka district");
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
      .populate("gramPanchayatId", "name taluka district"),
    ChangeRequest.countDocuments(filter),
  ]);

  return res.json({ changeRequests, pagination: buildPaginationMeta(page, limit, total) });
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

  const editableFields = changeRequest.entityType === "Person" ? PERSON_EDITABLE_FIELDS : changeRequest.entityType === "GramPanchayat" ? GP_EDITABLE_FIELDS : GENERAL_EDITABLE_FIELDS;
  const cleanedChanges = { ...changeRequest.proposedChanges.toObject?.() ?? changeRequest.proposedChanges };
  for (const key of Object.keys(proposedChanges)) {
    if (editableFields.includes(key)) {
      cleanedChanges[key] = proposedChanges[key];
    }
  }

  changeRequest.proposedChanges = cleanedChanges;
  changeRequest.markModified("proposedChanges");
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
  const { edits, confirmReplaceHolder } = req.body;
  if (edits && typeof edits === "object") {
    const editableFields = changeRequest.entityType === "Person" ? PERSON_EDITABLE_FIELDS : changeRequest.entityType === "GramPanchayat" ? GP_EDITABLE_FIELDS : GENERAL_EDITABLE_FIELDS;
    const merged = { ...(changeRequest.proposedChanges.toObject?.() ?? changeRequest.proposedChanges) };
    for (const key of Object.keys(edits)) {
      if (editableFields.includes(key)) merged[key] = edits[key];
    }
    changeRequest.proposedChanges = merged;
    changeRequest.markModified("proposedChanges");
  }

  const changes = changeRequest.proposedChanges;
  let resultEntity;
  let assignment;
  let replacedHolder;

  if (changeRequest.entityType === "General") {
    // General suggestions are intentionally review-only: approving records
    // that an admin accepted the suggestion, but does not blindly mutate an
    // unknown resource. The admin can act on the request using the captured
    // title/details/context.
    resultEntity = null;
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
      resultEntity = await Person.create({
        name: changes.name,
        nameMr: changes.nameMr,
        nameKey: normalizeName(changes.name),
        designation: changes.designation,
        phone: normalizedPhone,
        email: changes.email,
        address: changes.address,
        addressMr: changes.addressMr,
        district: changes.district,
        notes: changes.notes,
      });
      await logFieldChanges({
        entityType: "Person",
        entityId: resultEntity._id,
        before: {},
        updates: changes,
        changedBy: req.user.id,
        source: "approved_request",
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
        source: "approved_request",
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
      await logFieldChanges({
        entityType: "GramPanchayat",
        entityId: resultEntity._id,
        before: {},
        updates: changes,
        changedBy: req.user.id,
        source: "approved_request",
      });
      emitToAdmins("gramPanchayat:new", resultEntity);
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
        source: "approved_request",
      });
      emitToAdmins("gramPanchayat:updated", resultEntity);
    }
  }

  changeRequest.status = "approved";
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

module.exports = { createChangeRequest, listChangeRequests, updateChangeRequest, approveChangeRequest, rejectChangeRequest };
