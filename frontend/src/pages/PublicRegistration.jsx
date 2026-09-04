import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Sprout, ChevronLeft, ChevronRight, Building2, Users, Droplets, Receipt, Hammer, MapPinned, ListChecks } from "lucide-react";
import { registrationApi } from "../api/registrations";
import { rateDefaultsApi } from "../api/rateDefaults";
import { formFieldApi } from "../api/formFields";
import { apiErrorMessage } from "../api/client";
import RateTableEditor from "../components/RateTableEditor";
import DynamicFields from "../components/DynamicFields";
import { useLanguage } from "../context/LanguageContext";

const initialForm = {
  gramPanchayatName: "", gramPanchayatNameMr: "", mukamPost: "", taluka: "", district: "", pincode: "",
  officePhone: "", officeEmail: "", gpType: "",
  sarpanchName: "", sarpanchNameMr: "", sarpanchPhone: "", sarpanchEmail: "",
  gramsevakName: "", gramsevakNameMr: "", gramsevakPhone: "", gramsevakEmail: "",
  computerOperatorName: "", computerOperatorNameMr: "", computerOperatorPhone: "", computerOperatorEmail: "",
  waterSupplyMode: "", reassessmentYearFrom: "", reassessmentYearTo: "",
};

const TAX_COLUMNS = [{ key: "minRate", label: "Min" }, { key: "maxRate", label: "Max" }, { key: "panchayatRate", label: "Panchayat rate" }];
const SQM_COLUMNS = [{ key: "ratePerSqm", label: "Rate / sq.m." }];

const BASE_STEPS = [
  { key: "office", label: "Office", icon: Building2 },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "water", label: "Water & years", icon: Droplets },
  { key: "tax", label: "Tax rates", icon: Receipt },
  { key: "construction", label: "Construction", icon: Hammer },
  { key: "land", label: "Land rates", icon: MapPinned },
];

export default function PublicRegistration() {
  const { language, toggleLanguage, t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [taxRates, setTaxRates] = useState([]);
  const [constructionRates, setConstructionRates] = useState([]);
  const [landRates, setLandRates] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Admin-configurable extra questions (Settings -> Registration Form
  // Fields) - only appears as a step at all if at least one is defined.
  const STEPS = customFieldDefs.length
    ? [...BASE_STEPS, { key: "extra", label: "More", icon: ListChecks }]
    : BASE_STEPS;

  useEffect(() => {
    rateDefaultsApi.get().then((d) => {
      setTaxRates(d.taxRates);
      setConstructionRates(d.constructionRates);
      setLandRates(d.landRates);
    });
    formFieldApi.list("registration").then((d) => setCustomFieldDefs(d.fields)).catch(() => setCustomFieldDefs([]));
  }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(index) {
    const key = STEPS[index].key;
    if (key === "office" && (!form.gramPanchayatName.trim() || !form.taluka.trim() || !form.district.trim())) {
      return "Grampanchayat name, taluka, and district are required.";
    }
    return "";
  }

  function goNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateStep(0);
    if (err) { setError(err); setStep(0); return; }
    setError("");
    setSubmitting(true);
    try {
      await registrationApi.submit({ ...form, taxRates, constructionRates, landRates, customFields: customValues });
      setSubmitted(true);
    } catch (submitErr) {
      setError(apiErrorMessage(submitErr));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card max-w-md w-full p-5 sm:p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink mb-2">Registration received!</h1>
          <p className="text-sm text-ink-muted">
            Thank you — our team will review your details and get your Grampanchayat set up shortly.
          </p>
        </motion.div>
      </div>
    );
  }

  const currentKey = STEPS[step].key;

  return (
    <div className="min-h-screen bg-ink py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-9 w-9 rounded-lg bg-brand-500 flex items-center justify-center"><Sprout className="h-5 w-5 text-white" /></div>
          <div className="flex-1">
            <p className="font-display font-semibold text-white">GramSoft Registration</p>
            <p className="text-xs text-white/45">ग्रामपंचायत नोंदणी अर्ज — new Grampanchayat onboarding</p>
          </div>
          <button onClick={toggleLanguage} className="flex items-center gap-1 text-xs font-medium text-white/50 hover:text-white transition-colors flex-shrink-0">
            <span className={language === "en" ? "text-white" : ""}>EN</span>
            <span>/</span>
            <span className={language === "mr" ? "text-white" : ""}>मर</span>
          </button>
        </div>

        <div className="flex items-center mb-6 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none min-w-[64px]">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${i < step ? "bg-brand-500 text-white" : i === step ? "bg-accent-400 text-ink" : "bg-white/10 text-white/40"}`}>
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-[10px] font-medium hidden sm:block text-center ${i === step ? "text-white" : "text-white/40"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 rounded-full transition-colors ${i < step ? "bg-brand-500" : "bg-white/10"}`} />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-5">{error}</div>}

          <AnimatePresence mode="wait">
            <motion.div key={currentKey} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              {currentKey === "office" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">Grampanchayat office</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Name (English) <span className="text-signal-500">*</span></label>
                      <input autoFocus required className="field-input" value={form.gramPanchayatName} onChange={(e) => update("gramPanchayatName", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">नाव (मराठी)</label>
                      <input className="field-input" value={form.gramPanchayatNameMr} onChange={(e) => update("gramPanchayatNameMr", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">मु. पो. (Mu. Po.)</label>
                      <input className="field-input" value={form.mukamPost} onChange={(e) => update("mukamPost", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Pincode</label>
                      <input className="field-input" value={form.pincode} onChange={(e) => update("pincode", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Taluka <span className="text-signal-500">*</span></label>
                      <input required className="field-input" value={form.taluka} onChange={(e) => update("taluka", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">District <span className="text-signal-500">*</span></label>
                      <input required className="field-input" value={form.district} onChange={(e) => update("district", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Office phone</label>
                      <input className="field-input" value={form.officePhone} onChange={(e) => update("officePhone", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Office email</label>
                      <input type="email" className="field-input" value={form.officeEmail} onChange={(e) => update("officeEmail", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Grampanchayat type</label>
                    <div className="flex gap-3">
                      {[{ v: "single", l: "Single GP" }, { v: "group", l: "Group GP" }].map((opt) => (
                        <button type="button" key={opt.v} onClick={() => update("gpType", opt.v)} className={`btn flex-1 border ${form.gpType === opt.v ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {currentKey === "contacts" && (
                <div className="space-y-6">
                  <h2 className="font-display text-base font-semibold text-ink">Administrative contacts</h2>
                  {[
                    { prefix: "sarpanch", label: "Sarpanch" },
                    { prefix: "gramsevak", label: "Gramsevak / Gram Vikas Adhikari" },
                    { prefix: "computerOperator", label: "Computer Operator (संगणक कर्मचारी)" },
                  ].map(({ prefix, label }) => (
                    <div key={prefix} className="space-y-3">
                      <p className="text-sm font-semibold text-ink-soft">{label}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input className="field-input" placeholder="Name (English)" value={form[`${prefix}Name`]} onChange={(e) => update(`${prefix}Name`, e.target.value)} />
                        <input className="field-input" placeholder="नाव (मराठी)" value={form[`${prefix}NameMr`]} onChange={(e) => update(`${prefix}NameMr`, e.target.value)} />
                        <input className="field-input" placeholder="Phone" value={form[`${prefix}Phone`]} onChange={(e) => update(`${prefix}Phone`, e.target.value)} />
                        <input type="email" className="field-input" placeholder="Email" value={form[`${prefix}Email`]} onChange={(e) => update(`${prefix}Email`, e.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentKey === "water" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">Water supply & reassessment</h2>
                  <div>
                    <label className="field-label">Grampanchayat water supply department</label>
                    <div className="flex gap-3">
                      {[{ v: "combined", l: "Combined (एकत्र)" }, { v: "separate", l: "Separate (वेगळा)" }].map((opt) => (
                        <button type="button" key={opt.v} onClick={() => update("waterSupplyMode", opt.v)} className={`btn flex-1 border ${form.waterSupplyMode === opt.v ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Reassessment year from</label>
                      <input className="field-input" placeholder="e.g. 2026-27" value={form.reassessmentYearFrom} onChange={(e) => update("reassessmentYearFrom", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Reassessment year to</label>
                      <input className="field-input" placeholder="e.g. 2029-30" value={form.reassessmentYearTo} onChange={(e) => update("reassessmentYearTo", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {currentKey === "tax" && (
                <div className="space-y-3">
                  <h2 className="font-display text-base font-semibold text-ink">वार्षिक कर आकारणी दर (Tax rates)</h2>
                  <p className="text-xs text-ink-muted">Leave any row blank if it doesn't apply — fill in only the rates you have.</p>
                  <RateTableEditor rows={taxRates} onChange={setTaxRates} columns={TAX_COLUMNS} />
                </div>
              )}

              {currentKey === "construction" && (
                <div className="space-y-3">
                  <h2 className="font-display text-base font-semibold text-ink">बांधकाम दर (Construction rates)</h2>
                  <RateTableEditor rows={constructionRates} onChange={setConstructionRates} columns={SQM_COLUMNS} />
                </div>
              )}

              {currentKey === "land" && (
                <div className="space-y-3">
                  <h2 className="font-display text-base font-semibold text-ink">जमिनीचे रेडीरेकर दर (Land ready-reckoner rates)</h2>
                  <RateTableEditor rows={landRates} onChange={setLandRates} columns={SQM_COLUMNS} />
                </div>
              )}

              {currentKey === "extra" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">A few more questions</h2>
                  <DynamicFields fields={customFieldDefs} values={customValues} onChange={(k, v) => setCustomValues((c) => ({ ...c, [k]: v }))} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-6 pt-5 border-t border-line">
            <button type="button" onClick={goBack} disabled={step === 0} className="btn btn-ghost disabled:opacity-0">
              <ChevronLeft className="h-4 w-4" /> {t("back")}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={goNext} className="btn btn-primary">{t("next")} <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? t("saving") : t("submit")}</button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
