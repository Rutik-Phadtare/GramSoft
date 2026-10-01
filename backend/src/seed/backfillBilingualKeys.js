// Run with: npm run backfill:bilingual
//
// Safe to re-run any number of times. Repairs data entered/imported before the
// bilingual key system existed:
//   1. Learns which English/Marathi spellings of a district/taluka are one place
//      (from every record that carries both) and stores them.
//   2. Gives every Grampanchayat and contact language-independent
//      districtKey / talukaKey plus search + identity keys.
//   3. Fills the missing-language district & taluka labels using the most common
//      spelling in YOUR data - never machine translation.
//   4. Moves Marathi text typed in an English name field to the Marathi field (and back).
//   5. Repairs Marathi that an earlier CSV import stored garbled ("à¤•à¤¾à¤—à¤²"
//      instead of "कागल"). Only text that is unmistakably UTF-8-read-as-Latin-1
//      is touched; correct text is never altered.
//   6. Reports possible duplicate GPs (same place entered once per language).
//      It never merges or deletes anything.
// The server also runs this automatically on startup when it finds records without keys.

require("dotenv/config");
const mongoose = require("mongoose");
const GramPanchayat = require("../models/GramPanchayat");
const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const GeoAlias = require("../models/GeoAlias");
const { deriveGp, derivePerson } = require("../utils/bilingual");
const { fixMojibake, MOJIBAKE_QUERY } = require("../utils/textEncoding");
const { normalizeName } = require("../utils/normalize");
const geo = require("../utils/geo");

const BATCH = 500;
let running = false;

function diff(before, after, fields) {
  const $set = {};
  const $unset = {};
  for (const f of fields) {
    const b = before[f];
    const a = after[f];
    if (a === undefined || a === null) {
      if (b !== undefined && b !== null && f !== "taluka" && f !== "district") $unset[f] = "";
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b ?? null)) $set[f] = a;
  }
  return { $set, $unset };
}

function toOp(doc, { $set, $unset }) {
  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return Object.keys(update).length ? { updateOne: { filter: { _id: doc._id }, update } } : null;
}

async function flush(Model, ops, stats, label) {
  if (!ops.length) return;
  try {
    const res = await Model.bulkWrite(ops, { ordered: false });
    stats[label] += res.modifiedCount || 0;
  } catch (err) {
    // Usually a unique-index clash from promoting a Marathi taluka/name to English.
    // Retry those rows without touching identity-bearing fields so keys still get set.
    stats[label] += err.result?.modifiedCount ?? err.result?.nModified ?? 0;
    const failed = new Set((err.writeErrors || []).map((e) => e.index ?? e.err?.index));
    if (!failed.size) throw err;
    for (const idx of failed) {
      const op = ops[idx]?.updateOne;
      if (!op) continue;
      const safeSet = { ...(op.update.$set || {}) };
      delete safeSet.taluka;
      delete safeSet.name;
      try {
        await Model.updateOne({ _id: op.filter._id }, { $set: safeSet });
        stats.retriedWithoutTaluka++;
      } catch (e2) {
        stats.errors++;
      }
    }
  }
  ops.length = 0;
}

// Repairs garbled top-level string fields in place (before keys are derived).
async function repairGarbledText(Model, stats, log) {
  const hint = { $regex: MOJIBAKE_QUERY };
  const textFields = Model === GramPanchayat
    ? ["name", "nameMr", "mukamPost", "taluka", "talukaMr", "district", "districtMr", "address"]
    : ["name", "nameMr", "designation", "designationMr", "address", "district", "email"];
  const filter = { $or: textFields.map((f) => ({ [f]: hint })) };
  let fixed = 0;
  const ops = [];
  for await (const doc of Model.find(filter).lean().cursor()) {
    const $set = {};
    for (const [k, v] of Object.entries(doc)) {
      if (k === "_id" || typeof v !== "string") continue;
      const repaired = fixMojibake(v);
      if (repaired !== v) $set[k] = repaired;
    }
    if (!Object.keys($set).length) continue;
    if ("name" in $set || "nameMr" in $set) {
      $set.nameKey = normalizeName($set.name ?? doc.name ?? $set.nameMr ?? doc.nameMr);
    }
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set } } });
    fixed++;
  }
  for (let i = 0; i < ops.length; i += BATCH) {
    try {
      await Model.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
    } catch (err) {
      stats.errors += err.writeErrors?.length || 1; // e.g. repaired name now collides with an existing record
    }
  }
  if (fixed) log(`[backfill] repaired garbled Marathi text in ${fixed} ${Model.modelName} record(s)`);
  return fixed;
}

async function runBilingualBackfill({ log = console.log } = {}) {
  if (running) return { skipped: true, reason: "already running" };
  running = true;
  const started = Date.now();
  const stats = { gramPanchayats: 0, gpUpdated: 0, persons: 0, personUpdated: 0, aliasesLearned: 0, retriedWithoutTaluka: 0, errors: 0 };
  try {
    // ---- Pass 0: repair Marathi stored garbled by an earlier CSV import ----
    stats.garbledGpRepaired = await repairGarbledText(GramPanchayat, stats, log);
    stats.garbledPersonRepaired = await repairGarbledText(Person, stats, log);

    // ---- Pass 1: learn aliases + most common labels from your own data ----
    log("[backfill] pass 1/3: learning district/taluka spellings…");
    geo.setAliases("district", []);
    geo.setAliases("taluka", []);
    const pairs = { district: new Map(), taluka: new Map() };
    const labelRows = { district: new Map(), taluka: new Map() };
    const bump = (type, key, a, b) => {
      if (!key) return;
      const id = `${key}\u0000${a || ""}\u0000${b || ""}`;
      const cur = labelRows[type].get(id) || { k: key, a, b, n: 0 };
      cur.n++;
      labelRows[type].set(id, cur);
    };
    for await (const gp of GramPanchayat.find({}).select("district districtMr taluka talukaMr").lean().cursor()) {
      const g = geo.resolveGeo(gp);
      for (const p of g.pending) if (!pairs[p.type].has(p.from)) pairs[p.type].set(p.from, p.to);
      bump("district", g.districtKey, gp.district, gp.districtMr);
      bump("taluka", g.talukaKey, gp.taluka, gp.talukaMr);
    }
    for (const type of ["district", "taluka"]) {
      geo.setAliases(type, [...pairs[type].entries()]);
      const merged = new Map();
      for (const r of labelRows[type].values()) {
        const key = geo.keyFromParam(type, r.k);
        const id = `${key}\u0000${r.a || ""}\u0000${r.b || ""}`;
        const cur = merged.get(id) || { k: key, a: r.a, b: r.b, n: 0 };
        cur.n += r.n;
        merged.set(id, cur);
      }
      geo.primeLabels(type, geo.reduceLabelGroups([...merged.values()]));
    }
    const aliasDocs = [];
    for (const type of ["district", "taluka"]) {
      for (const [alias, canonical] of pairs[type]) aliasDocs.push({ type, alias, canonical });
    }
    if (aliasDocs.length) {
      await GeoAlias.bulkWrite(
        aliasDocs.map((d) => ({ updateOne: { filter: { type: d.type, alias: d.alias }, update: { $set: { canonical: d.canonical } }, upsert: true } })),
        { ordered: false }
      );
    }
    stats.aliasesLearned = aliasDocs.length;

    // ---- Pass 2: Grampanchayats ----
    log("[backfill] pass 2/3: Grampanchayats…");
    const gpDistrictKey = new Map();
    const gpFields = ["name", "nameMr", "district", "districtMr", "taluka", "talukaMr", "districtKey", "talukaKey", "searchKeys", "identityKeys"];
    const ops = [];
    for await (const gp of GramPanchayat.find({}).select(`${gpFields.join(" ")} nameKey`).lean().cursor()) {
      stats.gramPanchayats++;
      const d = deriveGp(gp, { relocate: true });
      gpDistrictKey.set(String(gp._id), d.districtKey);
      const change = diff(gp, d, gpFields);
      // Never blank out the only name a record has.
      if (change.$unset.name && !(d.nameMr || gp.nameMr)) delete change.$unset.name;
      const op = toOp(gp, change);
      if (op) ops.push(op);
      if (ops.length >= BATCH) {
        await flush(GramPanchayat, ops, stats, "gpUpdated");
        log(`[backfill]   …${stats.gramPanchayats} Grampanchayats scanned`);
      }
    }
    await flush(GramPanchayat, ops, stats, "gpUpdated");

    // ---- Pass 3: contacts ----
    log("[backfill] pass 3/3: contacts…");
    const currentGp = new Map();
    for await (const a of PersonAssignment.find({ toDate: null }).select("personId gramPanchayatId").lean().cursor()) {
      if (!currentGp.has(String(a.personId))) currentGp.set(String(a.personId), String(a.gramPanchayatId));
    }
    const pFields = ["name", "nameMr", "districtKey", "searchKeys", "identityKeys"];
    for await (const p of Person.find({}).select(`${pFields.join(" ")} district`).lean().cursor()) {
      stats.persons++;
      const d = derivePerson(p, { relocate: true });
      if (!d.districtKey) d.districtKey = gpDistrictKey.get(currentGp.get(String(p._id)));
      const change = diff(p, d, pFields);
      if (change.$unset.name && !(d.nameMr || p.nameMr)) delete change.$unset.name;
      const op = toOp(p, change);
      if (op) ops.push(op);
      if (ops.length >= BATCH) await flush(Person, ops, stats, "personUpdated");
    }
    await flush(Person, ops, stats, "personUpdated");

    geo.invalidateGeoOptionsCache();

    // ---- Report: same GP entered once per language ----
    const dupes = await GramPanchayat.aggregate([
      { $unwind: "$identityKeys" },
      { $group: { _id: { d: "$districtKey", t: "$talukaKey", k: "$identityKeys" }, ids: { $addToSet: "$_id" }, names: { $addToSet: { $ifNull: ["$name", "$nameMr"] } } } },
      { $match: { "ids.1": { $exists: true } } },
      { $limit: 200 },
    ]);
    stats.possibleDuplicateGroups = dupes.length;
    if (dupes.length) {
      log(`[backfill] ⚠ ${dupes.length} possible duplicate Grampanchayat group(s) (same district + taluka + similar name). Examples:`);
      for (const g of dupes.slice(0, 10)) log(`[backfill]     ${g.names.join("  |  ")}  (${g.ids.length} records)`);
      log("[backfill]   Nothing was merged. Review these in the admin panel and delete the extra record.");
    }

    stats.seconds = Math.round((Date.now() - started) / 100) / 10;
    log("[backfill] done:", JSON.stringify(stats));
    return stats;
  } finally {
    running = false;
  }
}

// True when any record still lacks keys (first deploy of this feature, or data imported some other way).
async function needsBilingualBackfill() {
  const hint = { $regex: MOJIBAKE_QUERY };
  const [gp, person, garbledGp, garbledPerson] = await Promise.all([
    GramPanchayat.exists({ $or: [{ districtKey: { $exists: false } }, { talukaKey: { $exists: false } }] }),
    Person.exists({ districtKey: { $exists: false }, district: { $exists: true, $ne: "" } }),
    GramPanchayat.exists({ $or: [{ name: hint }, { nameMr: hint }, { district: hint }, { taluka: hint }] }),
    Person.exists({ $or: [{ name: hint }, { nameMr: hint }] }),
  ]);
  return Boolean(gp || person || garbledGp || garbledPerson);
}

module.exports = { runBilingualBackfill, needsBilingualBackfill };

if (require.main === module) {
  const { connectDB } = require("../config/db");
  connectDB()
    .then(() => runBilingualBackfill())
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
