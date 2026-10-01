// Derived, language-independent fields for GramPanchayat and Person records
// (search tokens, identity keys, district/taluka keys) and the query builders
// that use them - one place, so create / update / import / backfill never
// disagree about how a record is indexed.

const { normalizeName, escapeRegex } = require("./normalize");
const { phoneticKey, words, hasDevanagari, hasLatin } = require("./phonetic");
const { resolveGeo, splitScripts } = require("./geo");

// Every token a record can be found by, both scripts:
//   raw:      "shivane bk", "shivane", "bk"
//   phonetic: "svn bk", "svn", "bk"  (same for शिवणे बु…)
// Lower-cased already, so search is an anchored-prefix regex on an indexed array.
function buildSearchKeys(...names) {
  const keys = new Set();
  for (const name of names) {
    const raw = normalizeName(name);
    if (!raw) continue;
    keys.add(raw);
    for (const w of words(raw)) keys.add(w);
    const ph = phoneticKey(name);
    if (ph) {
      keys.add(ph);
      for (const w of ph.split(" ")) keys.add(w);
    }
  }
  return [...keys].filter(Boolean);
}

const buildIdentityKeys = (...names) => [...new Set(names.map((n) => phoneticKey(n)).filter(Boolean))];

// Puts a Marathi name typed in the English box (or the reverse) in the right field. Never drops a value.
function relocateNames(name, nameMr) {
  const n = name ? String(name).trim() : undefined;
  const m = nameMr ? String(nameMr).trim() : undefined;
  const nDev = n && hasDevanagari(n) && !hasLatin(n);
  const mLat = m && hasLatin(m) && !hasDevanagari(m);
  if (nDev && !m) return { name: undefined, nameMr: n };
  if (mLat && !n) return { name: m, nameMr: undefined };
  if (nDev && mLat) return { name: m, nameMr: n };
  return { name: n, nameMr: m };
}

function deriveGp(v, { relocate = false } = {}) {
  const names = relocate ? relocateNames(v.name, v.nameMr) : { name: v.name, nameMr: v.nameMr };
  const geo = resolveGeo(v);
  return {
    ...(relocate ? { name: names.name, nameMr: names.nameMr } : {}),
    district: geo.district,
    districtMr: geo.districtMr,
    taluka: geo.taluka,
    talukaMr: geo.talukaMr,
    districtKey: geo.districtKey,
    talukaKey: geo.talukaKey,
    searchKeys: buildSearchKeys(names.name, names.nameMr),
    identityKeys: buildIdentityKeys(names.name, names.nameMr),
    _pending: geo.pending,
  };
}

function derivePerson(v, { relocate = false } = {}) {
  const names = relocate ? relocateNames(v.name, v.nameMr) : { name: v.name, nameMr: v.nameMr };
  const geo = resolveGeo({ district: v.district });
  return {
    ...(relocate ? { name: names.name, nameMr: names.nameMr } : {}),
    districtKey: geo.districtKey,
    searchKeys: buildSearchKeys(names.name, names.nameMr),
    identityKeys: buildIdentityKeys(names.name, names.nameMr),
    _pending: geo.pending,
  };
}

// "shivane" finds शिवणे, "शिवणे" finds Shivane; partial words match from the start of any word.
function buildNameSearchClauses(q) {
  const raw = normalizeName(q);
  if (!raw) return undefined;
  const ph = phoneticKey(q);
  const clauses = [{ searchKeys: { $regex: `^${escapeRegex(raw)}` } }];
  if (ph && ph !== raw) clauses.push({ searchKeys: { $regex: `^${escapeRegex(ph)}` } });
  return clauses;
}

// Same-script names must match exactly; a cross-script pair is accepted on
// phonetic match (the caller already matched identityKeys).
function sameEntity(existing, incoming) {
  const checks = [];
  if (existing.name && incoming.name) checks.push(normalizeName(existing.name) === normalizeName(incoming.name));
  if (existing.nameMr && incoming.nameMr) checks.push(normalizeName(existing.nameMr) === normalizeName(incoming.nameMr));
  return checks.length === 0 ? true : checks.some(Boolean);
}

module.exports = { buildSearchKeys, buildIdentityKeys, relocateNames, deriveGp, derivePerson, buildNameSearchClauses, sameEntity };
