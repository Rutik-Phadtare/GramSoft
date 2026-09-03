// One-time (but safe-to-rerun) migration for the Admin Form Builder work.
//
// Before this, ActivityNew.jsx decided which extra fields to show using
// hard-coded regexes against the activity type *key*:
//   isSupportType   -> /support/            -> showed "Problem & Solution"
//   isOutreachType  -> /sales|promotional|demo|follow_up/ -> showed "Their response"
// which meant a brand-new Admin-created Activity Type got neither field,
// and no Admin could add a third such field without a code change.
//
// This script creates the equivalent FormFieldConfig rows, scoped per
// Activity Type via `activityTypeKey`, so the exact same fields keep
// appearing for the exact same activity types as before - but now via the
// config system, and now editable/extendable by the Admin. It does NOT
// touch any existing ActivityLog documents; historical data is untouched.
//
// Safe to run multiple times: every insert is guarded by a findOne first.
//
// Usage: node src/seed/migrateActivityFieldsToConfig.js

require("dotenv").config();
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const FormFieldConfig = require("../models/FormFieldConfig");
const ActivityTypeConfig = require("../models/ActivityTypeConfig");

const SUPPORT_TYPE_RE = /support/;
const OUTREACH_TYPE_RE = /sales|promotional|demo|follow_up/;

const PROBLEM_SOLVED_FIELD = {
  key: "problemSolved",
  label: "Problem & Solution",
  type: "textarea",
  required: false,
  placeholder: "e.g. Couldn't generate the monthly report — walked them through the export filter.",
};

const CLIENT_INTEREST_FIELD = {
  key: "clientInterest",
  label: "Their response",
  type: "select",
  required: false,
  options: ["interested", "not_interested", "neutral", "needs_follow_up"],
};

// These two were shown for every activity type regardless of the regex
// match, so they become global (activityTypeKey: null) fields.
const GLOBAL_FIELDS = [
  { key: "durationMinutes", label: "Time spent (minutes)", type: "number", required: false },
  { key: "nextFollowUpDate", label: "Next follow-up", type: "date", required: false },
];

async function upsertField(target, activityTypeKey, def, orderStart) {
  const existing = await FormFieldConfig.findOne({ target, activityTypeKey, key: def.key });
  if (existing) {
    console.log(`  skip (exists): target=${target} activityTypeKey=${activityTypeKey} key=${def.key}`);
    return;
  }
  const count = await FormFieldConfig.countDocuments({ target, activityTypeKey });
  await FormFieldConfig.create({
    target,
    activityTypeKey,
    ...def,
    order: orderStart ?? count,
    active: true,
  });
  console.log(`  created: target=${target} activityTypeKey=${activityTypeKey} key=${def.key}`);
}

async function run() {
  await connectDB();
  console.log("Migrating legacy hard-coded activity fields into FormFieldConfig...");

  const types = await ActivityTypeConfig.find({});
  if (types.length === 0) {
    console.log("No ActivityTypeConfig rows found yet - run the app once (GET /api/activity-types) to seed defaults, then re-run this script.");
  }

  for (const t of types) {
    if (SUPPORT_TYPE_RE.test(t.key)) {
      await upsertField("activity", t.key, PROBLEM_SOLVED_FIELD);
    }
    if (OUTREACH_TYPE_RE.test(t.key)) {
      await upsertField("activity", t.key, CLIENT_INTEREST_FIELD);
    }
  }

  for (const def of GLOBAL_FIELDS) {
    await upsertField("activity", null, def);
  }

  console.log("Done.");
  await mongoose.disconnect();
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
