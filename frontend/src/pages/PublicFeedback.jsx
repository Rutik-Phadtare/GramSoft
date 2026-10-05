import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Sprout, ChevronLeft, ChevronRight, MapPin, Laptop, ListChecks, UserRound } from "lucide-react";
import { feedbackApi } from "../api/feedback";
import { formFieldApi } from "../api/formFields";
import { apiErrorMessage } from "../api/client";
import DynamicFields from "../components/DynamicFields";
import { DESIGNATIONS } from "../utils/constants";
import { DesignationOptions } from "../components/DesignationSelect";
import { useLanguage } from "../context/LanguageContext";


const initialForm = {
  gramPanchayatName: "", taluka: "", district: "", population: "", numberOfHouseholds: "",
  isUsingOurSoftware: "", previousSoftwareUsed: "", softwareStartDate: "",
  likedFeatures: "", improvementSuggestions: "",
  respondentName: "", respondentDesignation: "", respondentPhone: "", respondentEmail: "", additionalInfo: "",
};

export default function PublicFeedback() {
  const { language, toggleLanguage, t } = useLanguage();
  const [form, setForm] = useState(initialForm);
  const [customFields, setCustomFields] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);

  useEffect(() => {
    formFieldApi.list("feedback").then((data) => setCustomFields(data.fields)).catch(() => setCustomFields([]));
  }, []);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const steps = [
    { key: "gp", label: "Grampanchayat", icon: MapPin },
    { key: "software", label: "Software", icon: Laptop },
    ...(customFields.length ? [{ key: "extra", label: "A few more", icon: ListChecks }] : []),
    { key: "you", label: "Your details", icon: UserRound },
  ];
  const lastStep = steps.length - 1;

  function validateStep(index) {
    const key = steps[index].key;
    if (key === "gp" && !form.gramPanchayatName.trim()) return "Grampanchayat name is required.";
    if (key === "software" && form.isUsingOurSoftware === "") return "Please answer whether you're using our software.";
    if (key === "you" && (!form.respondentName.trim() || !form.respondentDesignation)) return "Your name and designation are required.";
    return "";
  }

  function goNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, lastStep));
  }
  function goBack() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await feedbackApi.submit({
        ...form,
        population: form.population ? Number(form.population) : undefined,
        numberOfHouseholds: form.numberOfHouseholds ? Number(form.numberOfHouseholds) : undefined,
        isUsingOurSoftware: form.isUsingOurSoftware === "yes",
        customFields: customValues,
      });
      setSubmitted(true);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card max-w-md w-full p-5 sm:p-8 text-center"
        >
          <div className="h-14 w-14 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink mb-2">Thank you!</h1>
          <p className="text-sm text-ink-muted">
            Your response has been recorded. Our team will follow up if any details need confirming.
          </p>
        </motion.div>
      </div>
    );
  }

  const currentStepKey = steps[step].key;

  return (
    <div className="min-h-screen bg-ink py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="h-9 w-9 rounded-lg bg-brand-500 flex items-center justify-center">
            <Sprout className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-white">GramSoft Feedback</p>
            <p className="text-xs text-white/45">Help us keep your Grampanchayat's details up to date</p>
          </div>
          <button onClick={toggleLanguage} className="flex items-center gap-1 text-xs font-medium text-white/50 hover:text-white transition-colors flex-shrink-0">
            <span className={language === "en" ? "text-white" : ""}>EN</span>
            <span>/</span>
            <span className={language === "mr" ? "text-white" : ""}>मर</span>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center mb-6">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    i < step ? "bg-brand-500 text-white" : i === step ? "bg-accent-400 text-ink" : "bg-white/10 text-white/40"
                  }`}
                >
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-[10px] font-medium hidden sm:block ${i === step ? "text-white" : "text-white/40"}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1.5 rounded-full transition-colors ${i < step ? "bg-brand-500" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-5">{error}</div>}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepKey}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {currentStepKey === "gp" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">About your Grampanchayat</h2>
                  <div>
                    <label className="field-label">Grampanchayat name <span className="text-signal-500">*</span></label>
                    <input autoFocus required className="field-input" value={form.gramPanchayatName} onChange={(e) => update("gramPanchayatName", e.target.value)} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Taluka</label>
                      <input className="field-input" value={form.taluka} onChange={(e) => update("taluka", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">District</label>
                      <input className="field-input" value={form.district} onChange={(e) => update("district", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Population</label>
                      <input type="number" className="field-input" value={form.population} onChange={(e) => update("population", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Number of households</label>
                      <input type="number" className="field-input" value={form.numberOfHouseholds} onChange={(e) => update("numberOfHouseholds", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {currentStepKey === "software" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">Software usage</h2>
                  <div>
                    <label className="field-label">Are you currently using our software? <span className="text-signal-500">*</span></label>
                    <div className="flex gap-3">
                      {["yes", "no"].map((opt) => (
                        <button
                          type="button"
                          key={opt}
                          onClick={() => update("isUsingOurSoftware", opt)}
                          className={`btn flex-1 border ${form.isUsingOurSoftware === opt ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}
                        >
                          {opt === "yes" ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.isUsingOurSoftware === "yes" ? (
                    <div>
                      <label className="field-label">Since when have you been using it?</label>
                      <input type="date" className="field-input" value={form.softwareStartDate} onChange={(e) => update("softwareStartDate", e.target.value)} />
                    </div>
                  ) : form.isUsingOurSoftware === "no" ? (
                    <div>
                      <label className="field-label">What software (if any) are you using instead?</label>
                      <input className="field-input" value={form.previousSoftwareUsed} onChange={(e) => update("previousSoftwareUsed", e.target.value)} />
                    </div>
                  ) : null}
                  <div>
                    <label className="field-label">What do you like about it?</label>
                    <textarea className="field-textarea" rows={3} value={form.likedFeatures} onChange={(e) => update("likedFeatures", e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Anything we should improve?</label>
                    <textarea className="field-textarea" rows={3} value={form.improvementSuggestions} onChange={(e) => update("improvementSuggestions", e.target.value)} />
                  </div>
                </div>
              )}

              {currentStepKey === "extra" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">A few more questions</h2>
                  <DynamicFields fields={customFields} values={customValues} onChange={(k, v) => setCustomValues((c) => ({ ...c, [k]: v }))} />
                </div>
              )}

              {currentStepKey === "you" && (
                <div className="space-y-4">
                  <h2 className="font-display text-base font-semibold text-ink">Your details</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Your name <span className="text-signal-500">*</span></label>
                      <input required className="field-input" value={form.respondentName} onChange={(e) => update("respondentName", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Designation <span className="text-signal-500">*</span></label>
                      <select required className="field-input" value={form.respondentDesignation} onChange={(e) => update("respondentDesignation", e.target.value)}>
                        <option value="">Select…</option>
                        <DesignationOptions />
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input className="field-input" value={form.respondentPhone} onChange={(e) => update("respondentPhone", e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Email</label>
                      <input type="email" className="field-input" value={form.respondentEmail} onChange={(e) => update("respondentEmail", e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="field-label">Anything else you'd like to add?</label>
                      <textarea className="field-textarea" rows={3} value={form.additionalInfo} onChange={(e) => update("additionalInfo", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-6 pt-5 border-t border-line">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0}
              className="btn btn-ghost disabled:opacity-0"
            >
              <ChevronLeft className="h-4 w-4" /> {t("back")}
            </button>
            {step < lastStep ? (
              <button type="button" onClick={goNext} className="btn btn-primary">
                {t("next")} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? "Submitting…" : "Submit feedback"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
