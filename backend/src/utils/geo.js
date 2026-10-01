// District / taluka canonicalisation for a bilingual (English + Marathi) app.
//
// Every GramPanchayat gets language-independent `districtKey` / `talukaKey`.
// Filters, grouping and de-duplication use these keys, so "Kolhapur",
// "कोल्हापूर" and "Dist. Kolhapur" are one district whichever language the row
// was entered in, and the UI shows the label for the selected language.
//  - Districts: Maharashtra's 36 districts are built in (both languages,
//    incl. old/new names such as Aurangabad = Chhatrapati Sambhajinagar).
//  - Talukas / unknown districts: matched by phonetic skeleton plus aliases
//    learned from your own data.

const { hasDevanagari, hasLatin, phoneticKey } = require("./phonetic");

const DISTRICTS = [
  ["ahilyanagar", "Ahilyanagar", "अहिल्यानगर", ["Ahmednagar", "Ahmadnagar", "अहमदनगर"]],
  ["akola", "Akola", "अकोला", []],
  ["amravati", "Amravati", "अमरावती", ["Amaravati"]],
  ["beed", "Beed", "बीड", ["Bid"]],
  ["bhandara", "Bhandara", "भंडारा", []],
  ["buldhana", "Buldhana", "बुलढाणा", ["Buldana", "बुलडाणा"]],
  ["chandrapur", "Chandrapur", "चंद्रपूर", ["चंद्रपुर"]],
  ["chhatrapati-sambhajinagar", "Chhatrapati Sambhajinagar", "छत्रपती संभाजीनगर", ["Aurangabad", "औरंगाबाद", "Sambhajinagar", "संभाजीनगर"]],
  ["dhule", "Dhule", "धुळे", ["Dhulia"]],
  ["gadchiroli", "Gadchiroli", "गडचिरोली", []],
  ["gondia", "Gondia", "गोंदिया", ["Gondiya"]],
  ["hingoli", "Hingoli", "हिंगोली", []],
  ["jalgaon", "Jalgaon", "जळगाव", ["जळगांव"]],
  ["jalna", "Jalna", "जालना", []],
  ["kolhapur", "Kolhapur", "कोल्हापूर", ["कोल्हापुर"]],
  ["latur", "Latur", "लातूर", ["लातुर"]],
  ["mumbai-city", "Mumbai City", "मुंबई शहर", ["Mumbai"]],
  ["mumbai-suburban", "Mumbai Suburban", "मुंबई उपनगर", ["Mumbai Upanagar"]],
  ["nagpur", "Nagpur", "नागपूर", ["नागपुर"]],
  ["nanded", "Nanded", "नांदेड", []],
  ["nandurbar", "Nandurbar", "नंदुरबार", []],
  ["nashik", "Nashik", "नाशिक", ["Nasik"]],
  ["dharashiv", "Dharashiv", "धाराशिव", ["Osmanabad", "उस्मानाबाद"]],
  ["palghar", "Palghar", "पालघर", []],
  ["parbhani", "Parbhani", "परभणी", []],
  ["pune", "Pune", "पुणे", ["Poona"]],
  ["raigad", "Raigad", "रायगड", ["Raigarh"]],
  ["ratnagiri", "Ratnagiri", "रत्नागिरी", []],
  ["sangli", "Sangli", "सांगली", []],
  ["satara", "Satara", "सातारा", []],
  ["sindhudurg", "Sindhudurg", "सिंधुदुर्ग", ["Sindhudurga"]],
  ["solapur", "Solapur", "सोलापूर", ["Sholapur", "सोलापुर"]],
  ["thane", "Thane", "ठाणे", ["Thana"]],
  ["wardha", "Wardha", "वर्धा", []],
  ["washim", "Washim", "वाशिम", []],
  ["yavatmal", "Yavatmal", "यवतमाळ", ["Yeotmal"]],
];

// Words people add around a place name ("Dist. Pune", "ता. करवीर") - not part of the key.
const PLACE_NOISE = new Set([
  "dist", "district", "jilha", "jilla", "जि", "जिल्हा", "जिल्ह्या",
  "tal", "taluka", "taluko", "tehsil", "tahsil", "ta", "ता", "तालुका", "तहसील",
]);

function cleanPlace(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  const isNoise = (w) => PLACE_NOISE.has(w.toLowerCase().replace(/[.,]/g, ""));
  while (parts.length > 1 && isNoise(parts[0])) parts.shift();
  while (parts.length > 1 && isNoise(parts[parts.length - 1])) parts.pop();
  return parts.join(" ").replace(/[.,]+$/g, "").trim();
}

const districtByPhonetic = new Map();
const districtByKey = new Map();
for (const [slug, en, mr, extras] of DISTRICTS) {
  const entry = { key: `d:${slug}`, en, mr };
  districtByKey.set(entry.key, entry);
  for (const name of [en, mr, ...extras]) {
    const ph = phoneticKey(name);
    if (ph && !districtByPhonetic.has(ph)) districtByPhonetic.set(ph, entry);
  }
}

// ---- learned state (aliases + best-known labels) ----
const aliases = { district: new Map(), taluka: new Map() };
const labels = { district: new Map(), taluka: new Map() }; // key -> { en, mr }

function canonicalKey(type, key) {
  let k = key;
  for (let i = 0; i < 3 && aliases[type].has(k); i++) k = aliases[type].get(k);
  return k;
}

function rememberLabel(type, key, en, mr) {
  if (!key) return;
  const cur = labels[type].get(key) || {};
  if (en && !cur.en) cur.en = en;
  if (mr && !cur.mr) cur.mr = mr;
  labels[type].set(key, cur);
}

// Splits values into the Latin-script one and the Devanagari one, whichever field they were typed in.
function splitScripts(...values) {
  let en;
  let mr;
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (hasDevanagari(v)) mr = mr || v;
    else if (hasLatin(v)) en = en || v;
  }
  return { en, mr };
}

function districtEntryFor(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const hit = districtByPhonetic.get(phoneticKey(cleanPlace(c)));
    if (hit) return hit;
  }
  return null;
}

function genericKey(prefix, ...candidates) {
  for (const c of candidates) {
    const ph = phoneticKey(cleanPlace(c));
    if (ph) return `${prefix}${ph.replace(/ /g, "_")}`;
  }
  return undefined;
}

/**
 * Normalises a district/taluka pair (either/both languages, any field) into
 * script-correct labels plus language-independent keys. Pure + synchronous.
 */
function resolveGeo({ district, districtMr, taluka, talukaMr } = {}) {
  const d = splitScripts(cleanPlace(district), cleanPlace(districtMr));
  const t = splitScripts(cleanPlace(taluka), cleanPlace(talukaMr));
  const pending = [];

  const entry = districtEntryFor(d.en, d.mr);
  let districtKey;
  let dEn = d.en;
  let dMr = d.mr;
  if (entry) {
    districtKey = entry.key;
    dEn = dEn || entry.en;
    dMr = dMr || entry.mr;
  } else {
    const kEn = genericKey("d~", d.en);
    const kMr = genericKey("d~", d.mr);
    districtKey = canonicalKey("district", kEn || kMr);
    if (kEn && kMr && canonicalKey("district", kEn) !== canonicalKey("district", kMr)) {
      districtKey = canonicalKey("district", kEn);
      pending.push({ type: "district", from: canonicalKey("district", kMr), to: districtKey });
    }
    const known = labels.district.get(districtKey) || {};
    dEn = dEn || known.en;
    dMr = dMr || known.mr;
    rememberLabel("district", districtKey, d.en, d.mr);
  }

  const kEnT = genericKey("t~", t.en);
  const kMrT = genericKey("t~", t.mr);
  let talukaKey = canonicalKey("taluka", kEnT || kMrT);
  if (kEnT && kMrT && canonicalKey("taluka", kEnT) !== canonicalKey("taluka", kMrT)) {
    talukaKey = canonicalKey("taluka", kEnT);
    pending.push({ type: "taluka", from: canonicalKey("taluka", kMrT), to: talukaKey });
  }
  const knownT = talukaKey ? labels.taluka.get(talukaKey) || {} : {};
  const tEn = t.en || knownT.en;
  const tMr = t.mr || knownT.mr;
  if (talukaKey) rememberLabel("taluka", talukaKey, t.en, t.mr);

  return {
    // Required schema fields fall back to the other language so they're never blank.
    district: dEn || dMr,
    districtMr: dMr,
    taluka: tEn || tMr,
    talukaMr: tMr,
    districtKey,
    talukaKey,
    pending,
  };
}

// Query-string value -> key. Accepts a key from the dropdown, or free text in either language.
function keyFromParam(type, value) {
  const v = String(value || "").trim();
  if (!v) return undefined;
  if (/^(d|t)[:~]/.test(v)) return canonicalKey(type, v);
  if (type === "district") {
    const hit = districtEntryFor(v);
    if (hit) return hit.key;
    return canonicalKey("district", genericKey("d~", v));
  }
  return canonicalKey("taluka", genericKey("t~", v));
}

// Persists "these two keys are one place" and re-points existing records at the canonical key.
async function learnAlias({ type, from, to }) {
  if (!from || !to || from === to) return;
  const GeoAlias = require("../models/GeoAlias");
  const GramPanchayat = require("../models/GramPanchayat");
  const Person = require("../models/Person");

  aliases[type].set(from, to);
  for (const [a, c] of aliases[type]) if (c === from) aliases[type].set(a, to);
  const fromLabels = labels[type].get(from);
  if (fromLabels) rememberLabel(type, to, fromLabels.en, fromLabels.mr);

  await GeoAlias.updateOne({ type, alias: from }, { $set: { canonical: to } }, { upsert: true });
  await GeoAlias.updateMany({ type, canonical: from }, { $set: { canonical: to } });
  if (type === "taluka") {
    await GramPanchayat.updateMany({ talukaKey: from }, { $set: { talukaKey: to } });
  } else {
    await GramPanchayat.updateMany({ districtKey: from }, { $set: { districtKey: to } });
    await Person.updateMany({ districtKey: from }, { $set: { districtKey: to } });
  }
  invalidateGeoOptionsCache();
}

function runPending(pending) {
  for (const p of pending || []) {
    learnAlias(p).catch((err) => console.error("[geo] alias learn failed:", err.message));
  }
}

// Most common Latin and Devanagari label per key from (key, labelA, labelB, count) rows.
function reduceLabelGroups(rows) {
  const byKey = new Map();
  for (const { k, a, b, n } of rows) {
    if (!k) continue;
    const slot = byKey.get(k) || { count: 0, en: new Map(), mr: new Map() };
    slot.count += n;
    for (const label of [a, b]) {
      if (!label) continue;
      const bucket = hasDevanagari(label) ? slot.mr : hasLatin(label) ? slot.en : null;
      if (bucket) bucket.set(label, (bucket.get(label) || 0) + n);
    }
    byKey.set(k, slot);
  }
  const best = (m) => [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
  return [...byKey.entries()].map(([key, s]) => ({ key, count: s.count, en: best(s.en), mr: best(s.mr) }));
}

async function loadGeoState() {
  const GeoAlias = require("../models/GeoAlias");
  const GramPanchayat = require("../models/GramPanchayat");
  const [rows, dLabels, tLabels] = await Promise.all([
    GeoAlias.find({}).lean(),
    GramPanchayat.aggregate([{ $group: { _id: { k: "$districtKey", a: "$district", b: "$districtMr" }, n: { $sum: 1 } } }]),
    GramPanchayat.aggregate([{ $group: { _id: { k: "$talukaKey", a: "$taluka", b: "$talukaMr" }, n: { $sum: 1 } } }]),
  ]);
  aliases.district.clear();
  aliases.taluka.clear();
  for (const r of rows) aliases[r.type].set(r.alias, r.canonical);
  for (const [type, groups] of [["district", dLabels], ["taluka", tLabels]]) {
    labels[type].clear();
    for (const { key, en, mr } of reduceLabelGroups(groups.map((g) => ({ k: g._id.k, a: g._id.a, b: g._id.b, n: g.n })))) {
      rememberLabel(type, key, en, mr);
    }
  }
}

function primeLabels(type, reducedRows) {
  labels[type].clear();
  for (const { key, en, mr } of reducedRows) rememberLabel(type, key, en, mr);
}

function setAliases(type, pairs) {
  aliases[type].clear();
  for (const [alias, canonical] of pairs) aliases[type].set(alias, canonical);
}

// ---- filter options (cached 60s, cleared on any GP write) ----
const optionsCache = new Map();
const OPTIONS_TTL_MS = 60_000;
function invalidateGeoOptionsCache() {
  optionsCache.clear();
}

async function getGeoOptions(districtParam) {
  const dKey = keyFromParam("district", districtParam);
  const cacheKey = dKey || "*";
  const hit = optionsCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.data;

  const GramPanchayat = require("../models/GramPanchayat");
  const group = (field, fieldMr, keyField) => ({
    $group: { _id: { k: `$${keyField}`, a: `$${field}`, b: `$${fieldMr}` }, n: { $sum: 1 } },
  });
  const [dRows, tRows] = await Promise.all([
    GramPanchayat.aggregate([group("district", "districtMr", "districtKey")]),
    GramPanchayat.aggregate([
      ...(dKey ? [{ $match: { districtKey: dKey } }] : []),
      group("taluka", "talukaMr", "talukaKey"),
    ]),
  ]);

  const shape = (rows, type) =>
    reduceLabelGroups(rows.map((g) => ({ k: g._id.k, a: g._id.a, b: g._id.b, n: g.n })))
      .map((o) => {
        const dict = type === "district" ? districtByKey.get(o.key) : null;
        const en = o.en || dict?.en;
        const mr = o.mr || dict?.mr;
        return { key: o.key, en, mr, label: en || mr, count: o.count };
      })
      .sort((x, y) => String(x.label).localeCompare(String(y.label)));

  const data = { districts: shape(dRows, "district"), talukas: shape(tRows, "taluka") };
  optionsCache.set(cacheKey, { expires: Date.now() + OPTIONS_TTL_MS, data });
  return data;
}

module.exports = {
  DISTRICTS, splitScripts, cleanPlace, resolveGeo, keyFromParam, learnAlias, runPending,
  loadGeoState, getGeoOptions, invalidateGeoOptionsCache, reduceLabelGroups, primeLabels, setAliases,
};
