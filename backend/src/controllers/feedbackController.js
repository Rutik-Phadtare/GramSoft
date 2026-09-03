const FeedbackFormResponse = require("../models/FeedbackFormResponse");
const FormFieldConfig = require("../models/FormFieldConfig");
const { upsertGramPanchayatAndPerson } = require("../utils/upsertGramPanchayatAndPerson");
const { asyncHandler } = require("../utils/asyncHandler");
const { emitToAdmins } = require("../sockets");
const { createAdminNotification } = require("./notificationController");
const { parsePagination, buildPaginationMeta } = require("../utils/paginate");

// POST /api/feedback - intentionally public. This is the link sent to
// Grampanchayats, Talathis, etc. and they don't have (or need) a login.
const submitFeedback = asyncHandler(async (req, res) => {
  const {
    gramPanchayatName, taluka, district, population, numberOfHouseholds,
    isUsingOurSoftware, previousSoftwareUsed, softwareStartDate,
    likedFeatures, improvementSuggestions, respondentName, respondentDesignation,
    respondentPhone, respondentEmail, additionalInfo, customFields,
  } = req.body;

  if (!gramPanchayatName || !respondentName || !respondentDesignation || isUsingOurSoftware === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const response = await FeedbackFormResponse.create({
    gramPanchayatName,
    taluka,
    district,
    population: population || undefined,
    numberOfHouseholds: numberOfHouseholds || undefined,
    isUsingOurSoftware: Boolean(isUsingOurSoftware),
    previousSoftwareUsed,
    softwareStartDate: softwareStartDate ? new Date(softwareStartDate) : undefined,
    likedFeatures,
    improvementSuggestions,
    respondentName,
    respondentDesignation,
    respondentPhone,
    respondentEmail,
    additionalInfo,
    customFields,
    status: "new",
  });

  emitToAdmins("feedback:new", response);
  await createAdminNotification({
    type: "feedback",
    section: "feedback",
    title: "New feedback received",
    message: `${response.respondentName} submitted feedback for ${response.gramPanchayatName}.`,
    link: "/admin/feedback",
    sourceId: response._id,
  });
  return res.status(201).json({ ok: true, id: response._id });
});

// GET /api/feedback?status=&page=&limit= - admin only
const listFeedback = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = status ? { status } : {};

  const [responses, total] = await Promise.all([
    FeedbackFormResponse.find(filter).sort({ submittedAt: -1 }).skip(skip).limit(limit),
    FeedbackFormResponse.countDocuments(filter),
  ]);

  return res.json({ responses, pagination: buildPaginationMeta(page, limit, total) });
});

// PATCH /api/feedback/:id - admin only
const updateFeedbackStatus = asyncHandler(async (req, res) => {
  if (req.body.status !== "reviewed" && req.body.status !== "new") {
    return res.status(400).json({ error: "status must be 'reviewed' or 'new'" });
  }
  const response = await FeedbackFormResponse.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!response) return res.status(404).json({ error: "Not found" });

  emitToAdmins("feedback:updated", response);
  return res.json({ response });
});

const FEEDBACK_EDITABLE_FIELDS = [
  "gramPanchayatName", "taluka", "district", "population", "numberOfHouseholds",
  "isUsingOurSoftware", "previousSoftwareUsed", "softwareStartDate",
  "likedFeatures", "improvementSuggestions", "respondentName", "respondentDesignation",
  "respondentPhone", "respondentEmail", "additionalInfo", "customFields",
];

// PATCH /api/feedback/:id/details - admin only
//
// Lets an admin correct a submission (typo'd name, wrong phone, etc.)
// before reviewing or merging it, same idea as registrations.
const updateFeedbackDetails = asyncHandler(async (req, res) => {
  const response = await FeedbackFormResponse.findById(req.params.id);
  if (!response) return res.status(404).json({ error: "Not found" });
  if (response.status === "merged") {
    return res.status(409).json({ error: "This feedback has already been merged - edit the record directly instead" });
  }

  for (const key of FEEDBACK_EDITABLE_FIELDS) {
    if (key in req.body) {
      response[key] = key === "softwareStartDate" && req.body[key] ? new Date(req.body[key]) : req.body[key];
    }
  }
  await response.save();

  emitToAdmins("feedback:updated", response);
  return res.json({ response });
});

// POST /api/feedback/:id/merge - admin only - runs the same dedupe logic as bulk import
const mergeFeedback = asyncHandler(async (req, res) => {
  const response = await FeedbackFormResponse.findById(req.params.id);
  if (!response) return res.status(404).json({ error: "Not found" });
  if (response.status === "merged") {
    return res.status(409).json({ error: "Already merged" });
  }

  const result = await upsertGramPanchayatAndPerson({
    gramPanchayatName: response.gramPanchayatName,
    taluka: response.taluka,
    district: response.district,
    population: response.population,
    numberOfHouseholds: response.numberOfHouseholds,
    isUsingOurSoftware: response.isUsingOurSoftware,
    previousSoftwareUsed: response.previousSoftwareUsed,
    softwareStartDate: response.softwareStartDate,
    personName: response.respondentName,
    designation: response.respondentDesignation,
    phone: response.respondentPhone,
    email: response.respondentEmail,
  });

  response.status = "merged";
  response.mergedGramPanchayatId = result.gramPanchayatId;
  if (result.personId) response.mergedPersonId = result.personId;
  await response.save();

  emitToAdmins("feedback:merged", { id: response._id, result });
  return res.json({ ok: true, result });
});

function csvEscape(value) {
  const str = value === undefined || value === null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

// GET /api/feedback/export?status= - admin only, streams a CSV of every
// matching submission with every field a GP actually answered, including
// admin-added custom questions, plus exactly when it was submitted -
// nothing summarized or left out the way the on-screen list is.
const exportFeedback = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};

  const responses = await FeedbackFormResponse.find(filter).sort({ submittedAt: -1 }).limit(20000);
  const customFieldDefs = await FormFieldConfig.find({ target: "feedback" }).sort({ order: 1 });

  const header = [
    "submitted_at", "status", "gram_panchayat_name", "taluka", "district", "population", "number_of_households",
    "is_using_our_software", "previous_software_used", "software_start_date",
    "liked_features", "improvement_suggestions",
    "respondent_name", "respondent_designation", "respondent_phone", "respondent_email", "additional_info",
    ...customFieldDefs.map((f) => f.label),
  ];

  const rows = responses.map((r) =>
    [
      new Date(r.submittedAt || r.createdAt).toISOString(),
      r.status,
      r.gramPanchayatName, r.taluka, r.district, r.population, r.numberOfHouseholds,
      r.isUsingOurSoftware ? "yes" : "no", r.previousSoftwareUsed,
      r.softwareStartDate ? new Date(r.softwareStartDate).toISOString().slice(0, 10) : "",
      r.likedFeatures, r.improvementSuggestions,
      r.respondentName, r.respondentDesignation, r.respondentPhone, r.respondentEmail, r.additionalInfo,
      ...customFieldDefs.map((f) => {
        const v = r.customFields?.[f.key];
        return Array.isArray(v) ? v.join("; ") : v;
      }),
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="gramsoft-feedback-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
});

module.exports = { submitFeedback, listFeedback, updateFeedbackStatus, updateFeedbackDetails, mergeFeedback, exportFeedback };
