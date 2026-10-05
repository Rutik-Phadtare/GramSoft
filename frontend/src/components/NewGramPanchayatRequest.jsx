import { useEffect, useState } from "react";
import { Building2, Users, ChevronLeft, ChevronRight, CheckCircle2, Droplets, Hammer, ListChecks, MapPinned, Receipt } from "lucide-react";
import { changeRequestApi } from "../api/changeRequests";
import { rateDefaultsApi } from "../api/rateDefaults";
import { formFieldApi } from "../api/formFields";
import { apiErrorMessage } from "../api/client";
import RateTableEditor from "./RateTableEditor";
import DynamicFields from "./DynamicFields";
import Modal from "./Modal";
import ContactsEditor from "./ContactsEditor";

const INITIAL = {
  name: "", nameMr: "", mukamPost: "", taluka: "", district: "", pincode: "",
  officePhone: "", officeEmail: "", gpType: "", waterSupplyMode: "",
  reassessmentYearFrom: "", reassessmentYearTo: "",
};
const TAX_COLUMNS = [{ key: "minRate", label: "Min" }, { key: "maxRate", label: "Max" }, { key: "panchayatRate", label: "Panchayat rate" }];
const SQM_COLUMNS = [{ key: "ratePerSqm", label: "Rate / sq.m." }];
const BASE_STEPS = [
  { key: "office", label: "Office", icon: Building2 },
  { key: "water", label: "Water & years", icon: Droplets },
  { key: "tax", label: "Tax rates", icon: Receipt },
  { key: "construction", label: "Construction", icon: Hammer },
  { key: "land", label: "Land rates", icon: MapPinned },
  { key: "contacts", label: "Contacts", icon: Users },
];

export default function NewGramPanchayatRequest({ open, onClose, onSubmitted }) {
  const [form, setForm] = useState(INITIAL);
  const [taxRates, setTaxRates] = useState([]);
  const [constructionRates, setConstructionRates] = useState([]);
  const [landRates, setLandRates] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [contacts, setContacts] = useState([]);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const steps = customFieldDefs.length ? [...BASE_STEPS, { key: "extra", label: "More", icon: ListChecks }] : BASE_STEPS;

  useEffect(() => {
    if (!open) return;
    Promise.all([
      rateDefaultsApi.get(),
      formFieldApi.list("gramPanchayat").catch(() => ({ fields: [] })),
    ]).then(([rates, fields]) => {
      setTaxRates(rates.taxRates || []);
      setConstructionRates(rates.constructionRates || []);
      setLandRates(rates.landRates || []);
      setCustomFieldDefs(fields.fields || []);
    });
  }, [open]);

  function update(key, value) { setForm((f) => ({ ...f, [key]: value })); }
  function reset() {
    setForm(INITIAL);
    setCustomValues({});
    setContacts([]);
    setStep(0);
    setError("");
    setSubmitted(false);
  }
  function close() { reset(); onClose(); }

  async function submit() {
    if (!form.name.trim() || !form.taluka.trim() || !form.district.trim()) {
      setError("Grampanchayat name, taluka, and district are required.");
      setStep(0);
      return;
    }
    if (submitting) return;
    const incomplete = contacts.findIndex((c) => !(c.name || "").trim() && !(c.nameMr || "").trim());
    if (incomplete >= 0) { setError(`Contact ${incomplete + 1} needs a name, or remove it.`); setStep(steps.findIndex((x) => x.key === "contacts")); return; }
    setSubmitting(true); setError("");
    try {
      await changeRequestApi.create({
        entityType: "GramPanchayat",
        proposedChanges: { ...form, taxRates, constructionRates, landRates, customFields: customValues, ...(contacts.length ? { contacts } : {}) },
        reason: "New Grampanchayat suggested from the field activity form",
        isNewEntity: true,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally { setSubmitting(false); }
  }

  return (
    <Modal open={open} onClose={close} title="Suggest a new Grampanchayat" maxWidth="max-w-2xl">
      {submitted ? (
        <div className="py-8 text-center">
          <div className="h-12 w-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-3"><CheckCircle2 className="h-6 w-6" /></div>
          <h3 className="font-display font-semibold text-ink">GP submitted for admin review</h3>
          <p className="text-sm text-ink-muted mt-1">The Grampanchayat will appear in the directory after an admin approves this request.</p>
          <button type="button" onClick={close} className="btn btn-primary mt-5">Done</button>
        </div>
      ) : (
        <div>
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{error}</div>}
          <div className="flex items-center mb-5 overflow-x-auto pb-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-[72px]">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold ${i < step ? "bg-brand-500 text-white" : i === step ? "bg-accent-400 text-ink" : "bg-canvas text-ink-muted"}`}>
                    {i < step ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-[10px] font-medium ${i === step ? "text-ink" : "text-ink-muted"}`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1 rounded-full ${i < step ? "bg-brand-500" : "bg-line"}`} />}
              </div>;
            })}
          </div>

          {steps[step].key === "office" && <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="field-label">Name (English) *</label><input autoFocus className="field-input" value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
            <div><label className="field-label">नाव (मराठी)</label><input className="field-input" value={form.nameMr} onChange={(e) => update("nameMr", e.target.value)} /></div>
            <div><label className="field-label">मु. पो.</label><input className="field-input" value={form.mukamPost} onChange={(e) => update("mukamPost", e.target.value)} /></div>
            <div><label className="field-label">Pincode</label><input className="field-input" value={form.pincode} onChange={(e) => update("pincode", e.target.value)} /></div>
            <div><label className="field-label">Taluka *</label><input className="field-input" value={form.taluka} onChange={(e) => update("taluka", e.target.value)} /></div>
            <div><label className="field-label">District *</label><input className="field-input" value={form.district} onChange={(e) => update("district", e.target.value)} /></div>
            <div><label className="field-label">Office phone</label><input className="field-input" value={form.officePhone} onChange={(e) => update("officePhone", e.target.value)} /></div>
            <div><label className="field-label">Office email</label><input type="email" className="field-input" value={form.officeEmail} onChange={(e) => update("officeEmail", e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="field-label">Grampanchayat type</label><div className="flex gap-2">{[{v:"single",l:"Single GP"},{v:"group",l:"Group GP"}].map(o => <button type="button" key={o.v} onClick={() => update("gpType", o.v)} className={`btn flex-1 border ${form.gpType===o.v ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>{o.l}</button>)}</div></div>
          </div>}

          {steps[step].key === "water" && <div className="space-y-4">
            <div><label className="field-label">Water supply department</label><div className="flex gap-2">{[{v:"combined",l:"Combined (एकत्र)"},{v:"separate",l:"Separate (वेगळा)"}].map(o => <button type="button" key={o.v} onClick={() => update("waterSupplyMode", o.v)} className={`btn flex-1 border ${form.waterSupplyMode===o.v ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>{o.l}</button>)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><label className="field-label">Reassessment year from</label><input className="field-input" placeholder="e.g. 2026-27" value={form.reassessmentYearFrom} onChange={(e) => update("reassessmentYearFrom", e.target.value)} /></div><div><label className="field-label">Reassessment year to</label><input className="field-input" placeholder="e.g. 2029-30" value={form.reassessmentYearTo} onChange={(e) => update("reassessmentYearTo", e.target.value)} /></div></div>
          </div>}

          {steps[step].key === "tax" && <RateTableEditor rows={taxRates} onChange={setTaxRates} columns={TAX_COLUMNS} />}
          {steps[step].key === "construction" && <RateTableEditor rows={constructionRates} onChange={setConstructionRates} columns={SQM_COLUMNS} />}
          {steps[step].key === "land" && <RateTableEditor rows={landRates} onChange={setLandRates} columns={SQM_COLUMNS} />}
          {steps[step].key === "contacts" && <div><p className="text-xs text-ink-muted mb-3">Optional. Contacts you add here are reviewed together with the Grampanchayat.</p><ContactsEditor value={contacts} onChange={setContacts} disabled={submitting} /></div>}
          {steps[step].key === "extra" && <DynamicFields fields={customFieldDefs} values={customValues} onChange={(k, v) => setCustomValues((c) => ({ ...c, [k]: v }))} />}

          <div className="flex items-center justify-between pt-5 mt-5 border-t border-line">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn btn-ghost disabled:opacity-0"><ChevronLeft className="h-4 w-4" /> Back</button>
            {step < steps.length - 1 ? <button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} className="btn btn-primary">Next <ChevronRight className="h-4 w-4" /></button> : <button type="button" onClick={submit} disabled={submitting} className="btn btn-primary">{submitting ? "Submitting…" : "Submit for admin review"}</button>}
          </div>
          <p className="text-[11px] text-ink-muted mt-3">Nothing is added to the live GP directory until an admin reviews and approves this submission.</p>
        </div>
      )}
    </Modal>
  );
}
