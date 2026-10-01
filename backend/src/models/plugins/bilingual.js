// Keeps derived bilingual fields (districtKey, talukaKey, searchKeys,
// identityKeys, missing-language district/taluka labels) correct on EVERY
// write path - save(), create(), findOneAndUpdate(), updateOne(), upserts -
// so no controller (import, approval, edit...) has to remember to.

const { deriveGp, derivePerson } = require("../../utils/bilingual");
const { runPending } = require("../../utils/geo");

const GP_INPUTS = ["name", "nameMr", "taluka", "talukaMr", "district", "districtMr"];
const PERSON_INPUTS = ["name", "nameMr", "district"];
const GP_OUTPUTS = ["district", "districtMr", "taluka", "talukaMr", "districtKey", "talukaKey", "searchKeys", "identityKeys"];
const PERSON_OUTPUTS = ["districtKey", "searchKeys", "identityKeys"];

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

module.exports = function bilingualPlugin(schema, { kind }) {
  const inputs = kind === "gp" ? GP_INPUTS : PERSON_INPUTS;
  const outputs = kind === "gp" ? GP_OUTPUTS : PERSON_OUTPUTS;
  const derive = kind === "gp" ? deriveGp : derivePerson;

  schema.pre("validate", function bilingualOnSave(next) {
    try {
      const d = derive(this.toObject(), { relocate: this.isNew });
      for (const key of outputs) {
        if (d[key] !== undefined && !sameValue(this.get(key), d[key])) this.set(key, d[key]);
      }
      if (this.isNew) {
        for (const key of ["name", "nameMr"]) {
          if (!sameValue(this.get(key), d[key])) this.set(key, d[key]);
        }
      }
      if (!this.nameKey) this.nameKey = String(this.name || this.nameMr || "").trim().toLowerCase().replace(/\s+/g, " ");
      runPending(d._pending);
      next();
    } catch (err) {
      next(err);
    }
  });

  schema.pre(["findOneAndUpdate", "updateOne"], async function bilingualOnUpdate() {
    const update = this.getUpdate() || {};
    const plain = Object.fromEntries(Object.entries(update).filter(([k]) => !k.startsWith("$")));
    const set = { ...plain, ...(update.$set || {}) };
    const onInsert = update.$setOnInsert || {};
    if (!inputs.some((f) => f in set || f in onInsert)) return;

    const filter = this.getFilter();
    const existing = await this.model.findOne(filter).select(`${inputs.join(" ")} ${outputs.join(" ")}`).lean();

    let base;
    if (existing) {
      base = { ...existing, ...set };
    } else {
      const eq = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith("$") && (v === null || typeof v !== "object")));
      base = { ...eq, ...onInsert, ...set };
    }
    const d = derive(base);
    runPending(d._pending);

    const target = existing ? "$set" : "$setOnInsert";
    const next = { ...update };
    for (const k of Object.keys(plain)) delete next[k];
    next.$set = { ...set };
    if (!existing) next.$setOnInsert = { ...onInsert };
    for (const key of outputs) {
      const v = d[key];
      if (v === undefined) continue;
      if (existing && sameValue(existing[key], v)) continue;
      delete next.$set[key];
      if (next.$setOnInsert) delete next.$setOnInsert[key];
      next[target] = { ...(next[target] || {}), [key]: v };
    }
    if (!Object.keys(next.$set).length) delete next.$set;
    this.setUpdate(next);
  });
};
