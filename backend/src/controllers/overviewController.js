const ActivityLog = require("../models/ActivityLog");
const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const FeedbackFormResponse = require("../models/FeedbackFormResponse");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");

// GET /api/overview/admin - admin only
const adminOverview = asyncHandler(async (req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [totalGPs, usingSoftwareGPs, totalContacts, activitiesThisWeek, pendingFeedback, activeEmployees, recent] = await Promise.all([
    GramPanchayat.countDocuments({}),
    GramPanchayat.countDocuments({ isUsingOurSoftware: true }),
    Person.countDocuments({}),
    ActivityLog.countDocuments({ date: { $gte: sevenDaysAgo } }),
    FeedbackFormResponse.countDocuments({ status: "new" }),
    User.countDocuments({ role: "employee", active: true }),
    ActivityLog.find({})
      .sort({ date: -1 })
      .limit(20)
      .populate("employeeId", "name")
      .populate("gramPanchayatId", "name")
      .populate("personId", "name designation")
      .lean(),
  ]);

  return res.json({
    stats: { totalGPs, usingSoftwareGPs, totalContacts, activitiesThisWeek, pendingFeedback, activeEmployees },
    recent,
    fetchedAt: new Date().toISOString(),
  });
});

module.exports = { adminOverview };
