import { useState } from "react";
import { Lightbulb, Send } from "lucide-react";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";

const EMPTY = {
  category: "data_correction",
  targetArea: "System / process",
  title: "",
  details: "",
  requestedOutcome: "",
  urgency: "normal",
  page: "",
  referenceId: "",
};

const CATEGORIES = [
  ["data_correction", "Data correction"],
  ["missing_information", "Missing information"],
  ["process_issue", "Process / workflow issue"],
  ["feature_request", "Feature request"],
  ["access_issue", "Access / permission issue"],
  ["other", "Other"],
];

const AREAS = [
  "Activity / field logging",
  "Tasks",
  "Employees",
  "Feedback",
  "Registrations",
  "Explorer / search",
  "Reports / dashboard",
  "Settings / configuration",
  "System / process",
  "Other",
];

export default function EmployeeChangeSuggestion() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (form.title.trim().length < 3) return setError("Give the change a clear title.");
    if (form.details.trim().length < 10) return setError("Explain what should change and what is wrong today.");

    setSaving(true);
    try {
      await changeRequestApi.create({
        entityType: "General",
        proposedChanges: {
          ...form,
          title: form.title.trim(),
          details: form.details.trim(),
          requestedOutcome: form.requestedOutcome.trim(),
          page: form.page.trim(),
          referenceId: form.referenceId.trim(),
          submittedByEmployee: user?._id,
        },
        reason: `General change suggestion submitted by ${user?.name || "employee"}`,
      });
      setSubmitted(true);
      setForm(EMPTY);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="EMPLOYEE REQUEST"
        title={t("suggestChange")}
        description="Report any improvement, correction, workflow issue, or missing information outside the dedicated Grampanchayat and contact proposal forms."
      />

      {submitted ? (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-brand-50 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-brand-700" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-ink">Suggestion sent for admin review</h2>
              <p className="text-sm text-ink-muted">Nothing in the live system was changed automatically.</p>
            </div>
          </div>
          <button type="button" onClick={() => setSubmitted(false)} className="btn btn-primary">Submit another suggestion</button>
        </div>
      ) : (
        <form onSubmit={submit} className="card p-6 space-y-5">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Category *</label>
              <select className="field-input" value={form.category} onChange={(e) => update("category", e.target.value)}>
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Affected area *</label>
              <select className="field-input" value={form.targetArea} onChange={(e) => update("targetArea", e.target.value)}>
                {AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">What should change? *</label>
            <input className="field-input" maxLength={140} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Example: Add WhatsApp number to employee contacts" />
          </div>

          <div>
            <label className="field-label">What is wrong or missing today? *</label>
            <textarea className="field-textarea" rows={5} value={form.details} onChange={(e) => update("details", e.target.value)} placeholder="Describe the current behavior, what you observed, and why it should be changed." />
          </div>

          <div>
            <label className="field-label">Expected outcome</label>
            <textarea className="field-textarea" rows={3} value={form.requestedOutcome} onChange={(e) => update("requestedOutcome", e.target.value)} placeholder="What would the correct result look like?" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Priority</label>
              <select className="field-input" value={form.urgency} onChange={(e) => update("urgency", e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="field-label">Page / screen</label>
              <input className="field-input" value={form.page} onChange={(e) => update("page", e.target.value)} placeholder="Example: Settings → Activity Types" />
            </div>
          </div>

          <div>
            <label className="field-label">Reference ID / record (optional)</label>
            <input className="field-input" value={form.referenceId} onChange={(e) => update("referenceId", e.target.value)} placeholder="Paste an ID, task number, or other reference if available" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn btn-primary">
              <Send className="h-4 w-4" />
              {saving ? t("saving") : "Submit for admin review"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
