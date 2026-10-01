// Language-aware display of bilingual data (GP names, places, people).
// Records store English and Marathi separately and some have only one. These
// helpers pick the value for the selected language, fall back to the other
// language instead of showing blanks/"undefined", and never invent a translation.

const DEVANAGARI = /[\u0900-\u097F]/;
const isDevanagari = (s) => DEVANAGARI.test(String(s || ""));
const clean = (v) => (v == null ? "" : String(v).trim());

// Best value for `lang` from an English field and a Marathi field.
export function pick(lang, en, mr) {
  const e = clean(en);
  const m = clean(mr);
  if (lang === "mr") return m || e;
  if (e && !isDevanagari(e)) return e;
  return e || m;
}

// The value in the *other* language, if there is one and it differs.
function other(lang, en, mr, primary) {
  const candidate = lang === "mr" ? clean(en) : clean(mr);
  if (!candidate || candidate === primary) return "";
  return lang === "mr" ? (isDevanagari(candidate) ? "" : candidate) : (isDevanagari(candidate) ? candidate : "");
}

// { primary, secondary } - primary is in the selected language.
export function displayName(entity, lang) {
  if (!entity) return { primary: "", secondary: "" };
  const primary = pick(lang, entity.name, entity.nameMr);
  return { primary, secondary: other(lang, entity.name, entity.nameMr, primary) };
}

export function nameLine(entity, lang) {
  const { primary, secondary } = displayName(entity, lang);
  return secondary ? `${primary} · ${secondary}` : primary;
}

export const districtLabel = (gp, lang) => pick(lang, gp?.district, gp?.districtMr);
export const talukaLabel = (gp, lang) => pick(lang, gp?.taluka, gp?.talukaMr);

// "Taluka, District" in the selected language.
export function placeLine(gp, lang) {
  return [talukaLabel(gp, lang), districtLabel(gp, lang)].filter(Boolean).join(", ");
}

// "GP name, Taluka" - where a contact works. Always leads with the GP name.
export function workplaceLine(gp, lang, { withDistrict = false } = {}) {
  if (!gp) return "";
  const parts = [displayName(gp, lang).primary, talukaLabel(gp, lang)];
  if (withDistrict) parts.push(districtLabel(gp, lang));
  return parts.filter(Boolean).join(", ");
}

// /filter-options entries -> [{ value (language-independent key), label (selected language) }], sorted for that language.
export function sortedGeoOptions(options, lang) {
  const collator = new Intl.Collator(lang === "mr" ? "mr" : "en", { sensitivity: "base" });
  return (options || [])
    .map((o) => ({ value: o.key, label: pick(lang, o.en, o.mr) || o.label || o.key, count: o.count }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
