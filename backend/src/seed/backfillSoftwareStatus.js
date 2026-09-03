// Run with: npm run backfill:software-status
//
// Recomputes softwareUsageStatus on every existing Grampanchayat from its
// current isUsingOurSoftware/softwareStartDate values. Safe to run any
// number of times - it's a pure recalculation, not a one-way migration.
// You need this once if you imported or created Grampanchayats before the
// softwareUsageStatus field existed (it would have silently defaulted to
// "never_used" regardless of their real isUsingOurSoftware value).

require("dotenv/config");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const GramPanchayat = require("../models/GramPanchayat");

function computeSoftwareUsageStatus(isUsingOurSoftware, softwareStartDate) {
  if (isUsingOurSoftware) return "active";
  if (softwareStartDate) return "churned";
  return "never_used";
}

async function main() {
  await connectDB();

  const all = await GramPanchayat.find({}).select("isUsingOurSoftware softwareStartDate softwareUsageStatus");
  let changed = 0;

  for (const gp of all) {
    const correct = computeSoftwareUsageStatus(gp.isUsingOurSoftware, gp.softwareStartDate);
    if (gp.softwareUsageStatus !== correct) {
      gp.softwareUsageStatus = correct;
      await gp.save();
      changed++;
    }
  }

  console.log(`Checked ${all.length} Grampanchayats, corrected ${changed}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
