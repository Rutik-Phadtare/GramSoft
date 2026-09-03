const RegistrationFormResponse = require("../models/RegistrationFormResponse");
const GramPanchayat = require("../models/GramPanchayat");
const { upsertGramPanchayatAndPerson } = require("../utils/upsertGramPanchayatAndPerson");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { createAdminNotification } = require("./notificationController");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");

// POST /api/registrations - intentionally public. This is the digital
// version of the client's paper "ग्रामपंचायत नोंदणी अर्ज" - the link/QR
// sent to a new Grampanchayat that wants to start using the software, so
// they can submit their office details, admin contacts, and local tax
// rates without needing a login.
const submitRegistration = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body.gramPanchayatName || !body.taluka || !body.district) {
    return res.status(400).json({ error: "Grampanchayat name, taluka, and district are required" });
  }

  const response = await RegistrationFormResponse.create({
    gramPanchayatName: body.gramPanchayatName,
    gramPanchayatNameMr: body.gramPanchayatNameMr,
    mukamPost: body.mukamPost,
    taluka: body.taluka,
    district: body.district,
    pincode: body.pincode,
    officePhone: body.officePhone,
    officeEmail: body.officeEmail,
    gpType: body.gpType,

    sarpanchName: body.sarpanchName,
    sarpanchNameMr: body.sarpanchNameMr,
    sarpanchPhone: body.sarpanchPhone,
    sarpanchEmail: body.sarpanchEmail,

    gramsevakName: body.gramsevakName,
    gramsevakNameMr: body.gramsevakNameMr,
    gramsevakPhone: body.gramsevakPhone,
    gramsevakEmail: body.gramsevakEmail,

    computerOperatorName: body.computerOperatorName,
    computerOperatorNameMr: body.computerOperatorNameMr,
    computerOperatorPhone: body.computerOperatorPhone,
    computerOperatorEmail: body.computerOperatorEmail,

    waterSupplyMode: body.waterSupplyMode,
    reassessmentYearFrom: body.reassessmentYearFrom,
    reassessmentYearTo: body.reassessmentYearTo,

    taxRates: body.taxRates,
    constructionRates: body.constructionRates,
    landRates: body.landRates,
    customFields: body.customFields,

    status: "new",
  });

  emitToAdmins("registration:new", response);
  await createAdminNotification({
    type: "registration",
    section: "registrations",
    title: "New Grampanchayat registration",
    message: `${response.gramPanchayatName} submitted a new registration request.`,
    link: "/admin/registrations",
    sourceId: response._id,
  });
  return res.status(201).json({ ok: true, id: response._id });
});

// GET /api/registrations?status=&page=&limit= - admin only
const listRegistrations = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = status ? { status } : {};

  const [registrations, total] = await Promise.all([
    RegistrationFormResponse.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit),
    RegistrationFormResponse.countDocuments(filter),
  ]);

  return res.json({ registrations, pagination: buildPaginationMeta(page, limit, total) });
});

// GET /api/registrations/:id - admin only
const getRegistration = asyncHandler(async (req, res) => {
  const registration = await RegistrationFormResponse.findById(req.params.id);
  if (!registration) return res.status(404).json({ error: "Not found" });
  return res.json({ registration });
});

// PATCH /api/registrations/:id - admin only
const updateRegistrationStatus = asyncHandler(async (req, res) => {
  if (req.body.status !== "reviewed" && req.body.status !== "new") {
    return res.status(400).json({ error: "status must be 'reviewed' or 'new'" });
  }
  const registration = await RegistrationFormResponse.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!registration) return res.status(404).json({ error: "Not found" });

  emitToAdmins("registration:updated", registration);
  return res.json({ registration });
});

// Every field an admin may correct on a submission before merging it in -
// same list the public form itself collects, so nothing on the paper form
// is off-limits to fix.
const REGISTRATION_EDITABLE_FIELDS = [
  "gramPanchayatName", "gramPanchayatNameMr", "mukamPost", "taluka", "district", "pincode",
  "officePhone", "officeEmail", "gpType",
  "sarpanchName", "sarpanchNameMr", "sarpanchPhone", "sarpanchEmail",
  "gramsevakName", "gramsevakNameMr", "gramsevakPhone", "gramsevakEmail",
  "computerOperatorName", "computerOperatorNameMr", "computerOperatorPhone", "computerOperatorEmail",
  "waterSupplyMode", "reassessmentYearFrom", "reassessmentYearTo",
  "taxRates", "constructionRates", "landRates", "customFields",
];

// PATCH /api/registrations/:id/details - admin only
//
// Lets an admin correct anything on a submission - a misspelled name, a
// wrong phone digit, a rate the field officer read wrong - before it's
// reviewed or merged into the real directory. Merging still runs the same
// dedupe/merge logic afterward, now against the corrected data.
const updateRegistrationDetails = asyncHandler(async (req, res) => {
  const registration = await RegistrationFormResponse.findById(req.params.id);
  if (!registration) return res.status(404).json({ error: "Not found" });
  if (registration.status === "merged") {
    return res.status(409).json({ error: "This registration has already been merged - edit the Grampanchayat's profile directly instead" });
  }

  for (const key of REGISTRATION_EDITABLE_FIELDS) {
    if (key in req.body) registration[key] = req.body[key];
  }
  await registration.save();

  emitToAdmins("registration:updated", registration);
  return res.json({ registration });
});

// POST /api/registrations/:id/merge - admin only
//
// Folds the submission into the real directory: the Grampanchayat itself,
// plus up to three contacts (Sarpanch, Gramsevak, Computer Operator), each
// deduped exactly the way bulk import and feedback-merge already dedupe -
// by phone for the person, by name+taluka for the Grampanchayat. Then the
// registration-specific fields (bilingual name, office contact, GP type,
// water supply, reassessment years, and all three rate tables) are applied
// directly to that Grampanchayat, fully editable by an admin afterward.
const mergeRegistration = asyncHandler(async (req, res) => {
  const reg = await RegistrationFormResponse.findById(req.params.id);
  if (!reg) return res.status(404).json({ error: "Not found" });
  if (reg.status === "merged") {
    return res.status(409).json({ error: "Already merged" });
  }

  const contacts = [
    { name: reg.sarpanchName, phone: reg.sarpanchPhone, email: reg.sarpanchEmail, designation: "Sarpanch" },
    { name: reg.gramsevakName, phone: reg.gramsevakPhone, email: reg.gramsevakEmail, designation: "Gramsevak" },
    { name: reg.computerOperatorName, phone: reg.computerOperatorPhone, email: reg.computerOperatorEmail, designation: "Computer Operator" },
  ].filter((c) => c.name);

  let gramPanchayatId;
  if (contacts.length === 0) {
    // No named contacts at all - still register the Grampanchayat itself.
    const result = await upsertGramPanchayatAndPerson({
      gramPanchayatName: reg.gramPanchayatName,
      taluka: reg.taluka,
      district: reg.district,
    });
    gramPanchayatId = result.gramPanchayatId;
  } else {
    for (const contact of contacts) {
      const result = await upsertGramPanchayatAndPerson({
        gramPanchayatName: reg.gramPanchayatName,
        taluka: reg.taluka,
        district: reg.district,
        personName: contact.name,
        designation: contact.designation,
        phone: contact.phone,
        email: contact.email,
      });
      gramPanchayatId = result.gramPanchayatId;
    }
  }

  const registrationUpdates = {
    nameMr: reg.gramPanchayatNameMr,
    mukamPost: reg.mukamPost,
    pincode: reg.pincode,
    officePhone: reg.officePhone,
    officeEmail: reg.officeEmail,
    gpType: reg.gpType,
    waterSupplyMode: reg.waterSupplyMode,
    reassessmentYearFrom: reg.reassessmentYearFrom,
    reassessmentYearTo: reg.reassessmentYearTo,
    taxRates: reg.taxRates?.length ? reg.taxRates : undefined,
    constructionRates: reg.constructionRates?.length ? reg.constructionRates : undefined,
    landRates: reg.landRates?.length ? reg.landRates : undefined,
    customFields: reg.customFields && Object.keys(reg.customFields).length ? reg.customFields : undefined,
  };
  // Mongoose has no "skip undefined keys" update option - strip them by
  // hand, so a blank field on the submission doesn't overwrite something
  // already on file for this Grampanchayat.
  Object.keys(registrationUpdates).forEach((key) => {
    if (registrationUpdates[key] === undefined) delete registrationUpdates[key];
  });

  const gramPanchayat = await GramPanchayat.findByIdAndUpdate(gramPanchayatId, registrationUpdates, { new: true });

  reg.status = "merged";
  reg.mergedGramPanchayatId = gramPanchayatId;
  await reg.save();

  emitToAdmins("registration:merged", { id: reg._id, gramPanchayatId });
  return res.json({ ok: true, gramPanchayatId, gramPanchayat });
});

module.exports = {
  submitRegistration, listRegistrations, getRegistration, updateRegistrationStatus, updateRegistrationDetails, mergeRegistration,
};
