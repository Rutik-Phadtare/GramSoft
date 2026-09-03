// Run with: npm run seed
// Reads ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD (and MONGODB_URI) from
// .env and creates that account as the first admin, if it doesn't exist yet.
// Safe to re-run - it skips creating the account if that email already
// exists. There's no public signup page on purpose: employee accounts are
// meant to be created by an admin from Settings -> Employees, not
// self-registered.

require("dotenv/config");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const User = require("../models/User");

async function main() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in .env before running the seed script.");
  }

  await connectDB();

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });

  if (existing) {
    console.log(`An account already exists for ${email} - nothing to do.`);
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await User.create({
      name: ADMIN_NAME || "Admin",
      email,
      passwordHash,
      role: "admin",
      active: true,
    });
    console.log(`Created admin account for ${email}. You can log in with it now.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
