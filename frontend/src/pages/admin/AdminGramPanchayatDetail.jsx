import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Trash2, Save, X, Pencil, UserPlus, Users, CreditCard, Clock, MapPin, FileText, History as HistoryIcon,
} from "lucide-react";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { personApi } from "../../api/persons";
import { formFieldApi } from "../../api/formFields";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { DESIGNATIONS } from "../../utils/constants";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge, { designationTone, softwareStatusTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import RateTableEditor from "../../components/RateTableEditor";
import DynamicFields from "../../components/DynamicFields";
import ChangeHistoryList from "../../components/ChangeHistoryList";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate, formatDateTime, activityTypeLabel, softwareStatusLabel, paymentModeLabel } from "../../utils/format";

const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque", "other"];
const RATE_TABS = [
  { key: "tax", label: "Tax rates", field: "taxRates", columns: [
    { key: "minRate", label: "Min" }, { key: "maxRate", label: "Max" }, { key: "panchayatRate", label: "Panchayat rate" },
  ] },
  { key: "construction", label: "Construction rates", field: "constructionRates", columns: [{ key: "ratePerSqm", label: "Rate / sq.m." }] },
  { key: "land", label: "Land rates", field: "landRates", columns: [{ key: "ratePerSqm", label: "Rate / sq.m." }] },
];

// Which form fields belong to which card, so "Save" on one card only ever
// touches that card's data - editing the billing card can never
// accidentally overwrite the name, and vice versa.
const OVERVIEW_FIELDS = ["name", "nameMr", "taluka", "talukaMr", "district", "districtMr", "status", "population", "numberOfHouseholds"];
const REGISTRATION_FIELDS = [
  "mukamPost", "pincode", "officePhone", "officeEmail", "gpType", "waterSupplyMode",
  "reassessmentYearFrom", "reassessmentYearTo",
];
const BILLING_FIELDS = [
  "isUsingOurSoftware", "softwareStartDate", "subscriptionEndDate", "subscriptionYears",
  "priceAmount", "paymentMode", "previousSoftwareUsed",
];

const emptyEditForm = {
  name: "", nameMr: "", taluka: "", talukaMr: "", district: "", districtMr: "", pincode: "", officePhone: "", officeEmail: "",
  population: "", numberOfHouseholds: "", mukamPost: "", gpType: "", waterSupplyMode: "",
  reassessmentYearFrom: "", reassessmentYearTo: "",
  status: "prospect", isUsingOurSoftware: false, softwareStartDate: "", subscriptionEndDate: "",
  subscriptionYears: "", priceAmount: "", paymentMode: "", previousSoftwareUsed: "",
};

// Small header used at the top of every editable card: a title on the
// left, and either an Edit pencil or Save/Cancel buttons on the right,
// depending on whether this card is currently being edited.
function CardHeader({ icon: Icon, title, editing, onEdit, onCancel, onSave, saving }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-display text-sm font-semibold text-ink flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-ink-muted" />} {title}
      </h2>
      {editing ? (
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost text-xs py-1 px-2">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary text-xs py-1 px-2.5">
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <button type="button" onClick={onEdit} className="btn btn-outline text-xs py-1 px-2.5">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      )}
    </div>
  );
}

export default function AdminGramPanchayatDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyEditForm);

  // Only one card is ever in edit mode at a time - this is what makes the
  // page feel simple instead of "one giant form": you edit one thing,
  // save it, and move on, rather than a wall of inputs for the whole
  // record at once.
  const [editingSection, setEditingSection] = useState(null); // 'overview' | 'registration' | 'billing' | null
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [rateTab, setRateTab] = useState("tax");
  const [rateRows, setRateRows] = useState({ taxRates: [], constructionRates: [], landRates: [] });
  const [savingRates, setSavingRates] = useState(false);
  const [ratesDirty, setRatesDirty] = useState(false);

  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [customValues, setCustomValues] = useState({});
  const [savingCustom, setSavingCustom] = useState(false);

  const [addContactOpen, setAddContactOpen] = useState(false);
  const [addMode, setAddMode] = useState("search");
  const [existingPerson, setExistingPerson] = useState(null);
  const [newContactForm, setNewContactForm] = useState({ name: "", nameMr: "", designation: "Talathi", designationMr: "", phone: "", email: "" });
  const [addContactError, setAddContactError] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(null); // { conflict, message } - set when the backend reports an existing holder

  function toDateInputValue(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : "";
  }

  function formFromGp(gp) {
    return {
      name: gp.name, nameMr: gp.nameMr || "", taluka: gp.taluka, talukaMr: gp.talukaMr || "",
      district: gp.district, districtMr: gp.districtMr || "", pincode: gp.pincode || "",
      officePhone: gp.officePhone || "", officeEmail: gp.officeEmail || "",
      population: gp.population ?? "", numberOfHouseholds: gp.numberOfHouseholds ?? "",
      mukamPost: gp.mukamPost || "", gpType: gp.gpType || "", waterSupplyMode: gp.waterSupplyMode || "",
      reassessmentYearFrom: gp.reassessmentYearFrom || "", reassessmentYearTo: gp.reassessmentYearTo || "",
      status: gp.status, isUsingOurSoftware: gp.isUsingOurSoftware,
      softwareStartDate: toDateInputValue(gp.softwareStartDate),
      subscriptionEndDate: toDateInputValue(gp.subscriptionEndDate),
      subscriptionYears: gp.subscriptionYears ?? "", priceAmount: gp.priceAmount ?? "",
      paymentMode: gp.paymentMode || "", previousSoftwareUsed: gp.previousSoftwareUsed || "",
    };
  }

  function refresh() {
    gramPanchayatApi.get(id).then((d) => {
      setData(d);
      setForm(formFromGp(d.gramPanchayat));
      setCustomValues(d.gramPanchayat.customFields || {});
      setRateRows({
        taxRates: d.gramPanchayat.taxRates || [],
        constructionRates: d.gramPanchayat.constructionRates || [],
        landRates: d.gramPanchayat.landRates || [],
      });
      setRatesDirty(false);
    }).finally(() => setLoading(false));
  }

  useEffect(refresh, [id]);
  useEffect(() => {
    formFieldApi.list("gramPanchayat").then((d) => setCustomFieldDefs(d.fields)).catch(() => setCustomFieldDefs([]));
  }, []);
  useSocketEvent("activity:new", (entry) => {
    if (entry.gramPanchayatId?._id === id || entry.gramPanchayatId === id) refresh();
  });
  useSocketEvent("person:transferred", refresh);

  const searchPersons = useCallback((q) => personApi.list({ q }).then((d) => d.results), []);

  async function saveCustomFields() {
    setSavingCustom(true);
    setError("");
    try {
      await gramPanchayatApi.update(id, { customFields: customValues });
      setEditingSection(null);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingCustom(false);
    }
  }

  function startEdit(section) {
    setError("");
    setEditingSection(section);
  }

  function cancelEdit() {
    // Discard any unsaved changes for whichever card was open, by
    // re-deriving the form from the last-loaded data.
    if (data) {
      setForm(formFromGp(data.gramPanchayat));
      setCustomValues(data.gramPanchayat.customFields || {});
    }
    setError("");
    setEditingSection(null);
  }

  async function saveSection(fields) {
    setError("");
    setSaving(true);
    try {
      const payload = {};
      for (const key of fields) payload[key] = form[key];
      if (fields.includes("population")) payload.population = form.population === "" ? undefined : Number(form.population);
      if (fields.includes("numberOfHouseholds")) payload.numberOfHouseholds = form.numberOfHouseholds === "" ? undefined : Number(form.numberOfHouseholds);
      if (fields.includes("subscriptionYears")) payload.subscriptionYears = form.subscriptionYears === "" ? undefined : Number(form.subscriptionYears);
      if (fields.includes("priceAmount")) payload.priceAmount = form.priceAmount === "" ? undefined : Number(form.priceAmount);
      if (fields.includes("softwareStartDate")) payload.softwareStartDate = form.softwareStartDate || null;
      if (fields.includes("subscriptionEndDate")) payload.subscriptionEndDate = form.subscriptionEndDate || null;

      await gramPanchayatApi.update(id, payload);
      setEditingSection(null);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this Grampanchayat? Its activity history will be kept, but posting records will be removed.")) return;
    await gramPanchayatApi.remove(id);
    navigate("/admin/grampanchayats");
  }

  async function handleSaveRates() {
    setSavingRates(true);
    try {
      await gramPanchayatApi.update(id, rateRows);
      setRatesDirty(false);
      refresh();
    } finally {
      setSavingRates(false);
    }
  }

  function updateRateRows(field, rows) {
    setRateRows((r) => ({ ...r, [field]: rows }));
    setRatesDirty(true);
  }

  function openAddContact() {
    setAddMode("search");
    setExistingPerson(null);
    setNewContactForm({ name: "", nameMr: "", designation: "Talathi", designationMr: "", phone: "", email: "" });
    setAddContactError("");
    setReplaceConfirm(null);
    setAddContactOpen(true);
  }

  async function handleAddContact(confirmReplace = false) {
    setAddContactError("");
    setAddingContact(true);
    try {
      const basePayload = addMode === "search" ? { personId: existingPerson?._id } : newContactForm;
      if (addMode === "search" && !existingPerson) {
        setAddContactError("Search for and select a contact first.");
        setAddingContact(false);
        return;
      }
      if (addMode === "new" && (!newContactForm.name || !newContactForm.designation)) {
        setAddContactError("Name and designation are required.");
        setAddingContact(false);
        return;
      }
      await gramPanchayatApi.addContact(id, { ...basePayload, confirmReplace: confirmReplace || undefined });
      setAddContactOpen(false);
      setReplaceConfirm(null);
      refresh();
    } catch (err) {
      if (err?.response?.status === 409 && err.response.data?.requiresConfirmation) {
        setReplaceConfirm({
          conflict: err.response.data.conflict,
          message: err.response.data.message,
        });
      } else {
        setAddContactError(apiErrorMessage(err));
      }
    } finally {
      setAddingContact(false);
    }
  }

  function toggleHistory() {
    if (!showHistory && !history) {
      gramPanchayatApi.history(id).then((d) => setHistory(d.history));
    }
    setShowHistory((s) => !s);
  }

  if (loading || !data) {
    return <div className="max-w-3xl"><SkeletonRows rows={6} /></div>;
  }

  const gp = data.gramPanchayat;
  const lastActivity = data.lastActivity;
  const activeRateTab = RATE_TABS.find((rt) => rt.key === rateTab);

  return (
    <div>
      <Link to="/admin/grampanchayats" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-soft mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("backToGrampanchayats")}
      </Link>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> {gp.taluka}, {gp.district}
          </span>
        }
        title={gp.nameMr ? `${gp.name} · ${gp.nameMr}` : gp.name}
        action={
          <button onClick={handleDelete} className="btn btn-outline text-signal-600 border-signal-300 hover:bg-signal-50">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Badge tone={softwareStatusTone(gp.softwareUsageStatus)}>{softwareStatusLabel(gp.softwareUsageStatus)}</Badge>
        <Badge tone="outline">{gp.status}</Badge>
        {gp.gpType && <Badge tone="outline">{gp.gpType === "group" ? "Group GP" : "Single GP"}</Badge>}
        {gp.population != null && <Badge tone="outline">Population {gp.population.toLocaleString("en-IN")}</Badge>}
        {gp.numberOfHouseholds != null && <Badge tone="outline">{gp.numberOfHouseholds.toLocaleString("en-IN")} households</Badge>}
      </div>

      {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Overview - name, location, status, size. The most-edited card, so it's first. */}
          <div className="card p-5">
            <CardHeader
              icon={MapPin} title={t("basicInfo")}
              editing={editingSection === "overview"}
              onEdit={() => startEdit("overview")} onCancel={cancelEdit}
              onSave={() => saveSection(OVERVIEW_FIELDS)} saving={saving}
            />
            {editingSection === "overview" ? (
              <div className="space-y-3">
                <div>
                  <label className="field-label">{t("name")} (English)</label>
                  <input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">{t("nameMarathi")}</label>
                  <input className="field-input" value={form.nameMr} onChange={(e) => setForm((f) => ({ ...f, nameMr: e.target.value }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label">{t("taluka")}</label><input className="field-input" value={form.taluka} onChange={(e) => setForm((f) => ({ ...f, taluka: e.target.value }))} /></div>
                  <div><label className="field-label">{t("talukaMarathi")}</label><input className="field-input" value={form.talukaMr} onChange={(e) => setForm((f) => ({ ...f, talukaMr: e.target.value }))} /></div>
                  <div><label className="field-label">{t("district")}</label><input className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} /></div>
                  <div><label className="field-label">{t("districtMarathi")}</label><input className="field-input" value={form.districtMr} onChange={(e) => setForm((f) => ({ ...f, districtMr: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="field-label">Status</label>
                    <select className="field-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      <option value="prospect">Prospect</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div><label className="field-label">{t("population")}</label><input type="number" className="field-input" value={form.population} onChange={(e) => setForm((f) => ({ ...f, population: e.target.value }))} /></div>
                  <div><label className="field-label">{t("households")}</label><input type="number" className="field-input" value={form.numberOfHouseholds} onChange={(e) => setForm((f) => ({ ...f, numberOfHouseholds: e.target.value }))} /></div>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("taluka")}</dt><dd className="font-medium text-ink">{gp.taluka}{gp.talukaMr ? ` · ${gp.talukaMr}` : ""}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("district")}</dt><dd className="font-medium text-ink">{gp.district}{gp.districtMr ? ` · ${gp.districtMr}` : ""}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">Status</dt><dd className="font-medium text-ink capitalize">{gp.status}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("population")}</dt><dd className="font-medium text-ink">{gp.population != null ? gp.population.toLocaleString("en-IN") : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("households")}</dt><dd className="font-medium text-ink">{gp.numberOfHouseholds != null ? gp.numberOfHouseholds.toLocaleString("en-IN") : "—"}</dd></div>
              </dl>
            )}
          </div>

          {/* Registration details */}
          <div className="card p-5">
            <CardHeader
              icon={FileText} title={t("registrationDetails")}
              editing={editingSection === "registration"}
              onEdit={() => startEdit("registration")} onCancel={cancelEdit}
              onSave={() => saveSection(REGISTRATION_FIELDS)} saving={saving}
            />
            {editingSection === "registration" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label">{t("mukamPost")}</label><input className="field-input" value={form.mukamPost} onChange={(e) => setForm((f) => ({ ...f, mukamPost: e.target.value }))} /></div>
                  <div><label className="field-label">Pincode</label><input className="field-input" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label">Office phone</label><input className="field-input" value={form.officePhone} onChange={(e) => setForm((f) => ({ ...f, officePhone: e.target.value }))} /></div>
                  <div><label className="field-label">Office email</label><input type="email" className="field-input" value={form.officeEmail} onChange={(e) => setForm((f) => ({ ...f, officeEmail: e.target.value }))} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label">{t("gpType")}</label>
                    <select className="field-input" value={form.gpType} onChange={(e) => setForm((f) => ({ ...f, gpType: e.target.value }))}>
                      <option value="">—</option>
                      <option value="single">{t("single")}</option>
                      <option value="group">{t("group")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">{t("waterSupply")}</label>
                    <select className="field-input" value={form.waterSupplyMode} onChange={(e) => setForm((f) => ({ ...f, waterSupplyMode: e.target.value }))}>
                      <option value="">—</option>
                      <option value="combined">{t("combined")}</option>
                      <option value="separate">{t("separate")}</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label className="field-label">{t("reassessmentFrom")}</label><input className="field-input" placeholder="e.g. 2026-27" value={form.reassessmentYearFrom} onChange={(e) => setForm((f) => ({ ...f, reassessmentYearFrom: e.target.value }))} /></div>
                  <div><label className="field-label">{t("reassessmentTo")}</label><input className="field-input" placeholder="e.g. 2029-30" value={form.reassessmentYearTo} onChange={(e) => setForm((f) => ({ ...f, reassessmentYearTo: e.target.value }))} /></div>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("mukamPost")}</dt><dd className="font-medium text-ink">{gp.mukamPost || "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("pincode")}</dt><dd className="font-medium text-ink">{gp.pincode || "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("waterSupply")}</dt><dd className="font-medium text-ink">{gp.waterSupplyMode ? (gp.waterSupplyMode === "combined" ? t("combined") : t("separate")) : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("officePhone")}</dt><dd className="font-medium text-ink">{gp.officePhone || "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("officeEmail")}</dt><dd className="font-medium text-ink">{gp.officeEmail || "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("reassessmentYears")}</dt><dd className="font-medium text-ink">{gp.reassessmentYearFrom ? `${gp.reassessmentYearFrom} – ${gp.reassessmentYearTo}` : "—"}</dd></div>
              </dl>
            )}
          </div>

          {/* Software & billing */}
          <div className="card p-5">
            <CardHeader
              icon={CreditCard} title={t("softwareAndBilling")}
              editing={editingSection === "billing"}
              onEdit={() => startEdit("billing")} onCancel={cancelEdit}
              onSave={() => saveSection(BILLING_FIELDS)} saving={saving}
            />
            {editingSection === "billing" ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-300" checked={form.isUsingOurSoftware} onChange={(e) => setForm((f) => ({ ...f, isUsingOurSoftware: e.target.checked }))} />
                  {t("currentlyUsingSoftware")}
                </label>
                {form.isUsingOurSoftware ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="field-label">{t("startDate")}</label><input type="date" className="field-input" value={form.softwareStartDate} onChange={(e) => setForm((f) => ({ ...f, softwareStartDate: e.target.value }))} /></div>
                      <div><label className="field-label">{t("renewalDeadline")}</label><input type="date" className="field-input" value={form.subscriptionEndDate} onChange={(e) => setForm((f) => ({ ...f, subscriptionEndDate: e.target.value }))} /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className="field-label">{t("yearsPurchased")}</label><input type="number" min="0" className="field-input" value={form.subscriptionYears} onChange={(e) => setForm((f) => ({ ...f, subscriptionYears: e.target.value }))} /></div>
                      <div><label className="field-label">Price (₹)</label><input type="number" min="0" className="field-input" value={form.priceAmount} onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))} /></div>
                    </div>
                    <div>
                      <label className="field-label">Payment mode</label>
                      <select className="field-input" value={form.paymentMode} onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                        <option value="">Select…</option>
                        {PAYMENT_MODES.map((m) => <option key={m} value={m}>{paymentModeLabel(m)}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="field-label">{t("whatUsingInstead")}</label>
                    <input className="field-input" value={form.previousSoftwareUsed} onChange={(e) => setForm((f) => ({ ...f, previousSoftwareUsed: e.target.value }))} placeholder="Leave blank if never used any software" />
                  </div>
                )}
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("status")}</dt><dd className="font-medium text-ink">{softwareStatusLabel(gp.softwareUsageStatus)}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("started")}</dt><dd className="font-medium text-ink">{gp.softwareStartDate ? formatDate(gp.softwareStartDate) : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{gp.isUsingOurSoftware ? t("renewalDue") : t("ended")}</dt><dd className="font-medium text-ink">{gp.subscriptionEndDate ? formatDate(gp.subscriptionEndDate) : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("contractLength")}</dt><dd className="font-medium text-ink">{gp.subscriptionYears ? `${gp.subscriptionYears} yr` : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("price")}</dt><dd className="font-medium text-ink">{gp.priceAmount != null ? `₹${gp.priceAmount.toLocaleString("en-IN")}` : "—"}</dd></div>
                <div><dt className="text-xs text-ink-muted mb-0.5">{t("paymentMode")}</dt><dd className="font-medium text-ink">{gp.paymentMode ? paymentModeLabel(gp.paymentMode) : "—"}</dd></div>
                {!gp.isUsingOurSoftware && gp.previousSoftwareUsed && (
                  <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-ink-muted mb-0.5">{t("usingInstead")}</dt><dd className="font-medium text-ink">{gp.previousSoftwareUsed}</dd></div>
                )}
              </dl>
            )}
          </div>

          {/* Rate tables - already inline-editable (tabs + add row + save-when-dirty) */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-ink">{t("rateTables")}</h2>
              {ratesDirty && (
                <button onClick={handleSaveRates} disabled={savingRates} className="btn btn-primary text-sm py-1.5">
                  <Save className="h-3.5 w-3.5" /> {savingRates ? t("saving") : t("saveRates")}
                </button>
              )}
            </div>
            <div className="flex gap-2 mb-4">
              {RATE_TABS.map((rt) => (
                <button
                  key={rt.key}
                  onClick={() => setRateTab(rt.key)}
                  className={`btn text-xs py-1.5 border ${rateTab === rt.key ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}
                >
                  {rt.label}
                </button>
              ))}
            </div>
            <RateTableEditor
              rows={rateRows[activeRateTab.field]}
              onChange={(rows) => updateRateRows(activeRateTab.field, rows)}
              columns={activeRateTab.columns}
            />
          </div>

          {customFieldDefs.length > 0 && (
            <div className="card p-5">
              <CardHeader
                title="Additional info"
                editing={editingSection === "custom"}
                onEdit={() => startEdit("custom")} onCancel={cancelEdit}
                onSave={saveCustomFields} saving={savingCustom}
              />
              {editingSection === "custom" ? (
                <DynamicFields
                  fields={customFieldDefs}
                  values={customValues}
                  onChange={(key, value) => setCustomValues((v) => ({ ...v, [key]: value }))}
                />
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {customFieldDefs.map((field) => (
                    <div key={field.key}>
                      <dt className="text-xs text-ink-muted mb-0.5">{field.label}</dt>
                      <dd className="font-medium text-ink">
                        {field.type === "boolean"
                          ? (customValues[field.key] ? "Yes" : "No")
                          : (customValues[field.key] || "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-sm font-semibold text-ink flex items-center gap-2">
                <Users className="h-4 w-4 text-ink-muted" /> {t("currentContacts")}
              </h2>
              <button onClick={openAddContact} className="btn btn-outline text-sm py-1.5">
                <UserPlus className="h-3.5 w-3.5" /> {t("addContact")}
              </button>
            </div>
            {data.currentContacts.length === 0 ? (
              <EmptyState title={t("noCurrentContact")} />
            ) : (
              <ul className="divide-y divide-line">
                {data.currentContacts.map((a) => (
                  <li key={a._id}>
                    <Link to={`/admin/contacts/${a.personId?._id}`} className="flex items-center justify-between gap-2 py-2.5 hover:bg-canvas/60 -mx-2 px-2 rounded-lg transition-colors">
                      <div>
                        <p className="text-sm font-medium text-ink">{a.personId?.name}{a.personId?.nameMr ? ` · ${a.personId.nameMr}` : ""}</p>
                        <p className="text-xs text-ink-muted">
                          {a.personId?.phone || "No phone on file"}{a.personId?.email ? ` · ${a.personId.email}` : ""}
                        </p>
                      </div>
                      <Badge tone={designationTone(a.designationAtAssignment)}>{a.designationAtAssignment}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-muted" /> {t("lastWorkedBy")}
            </h2>
            {lastActivity ? (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-ink">{lastActivity.employeeId?.name}</span>
                  <Badge tone="brand">{activityTypeLabel(lastActivity.type)}</Badge>
                  <span className="text-xs text-ink-muted ml-auto">{formatDateTime(lastActivity.date)}</span>
                </div>
                <p className="text-sm text-ink-soft">{lastActivity.notes}</p>
              </div>
            ) : <EmptyState title={t("noActivityAtAll")} />}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("activityHistory")}</h2>
            {data.activity.length === 0 ? (
              <EmptyState title={t("noActivityAtAll")} />
            ) : (
              <ul className="divide-y divide-line">
                {data.activity.slice(0, 6).map((entry) => (
                  <li key={entry._id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-ink">{entry.employeeId?.name}</span>
                      <Badge tone="brand">{activityTypeLabel(entry.type)}</Badge>
                      <span className="text-xs text-ink-muted ml-auto">{formatDateTime(entry.date)}</span>
                    </div>
                    <p className="text-sm text-ink-soft">{entry.notes}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <button onClick={toggleHistory} className="flex items-center justify-between w-full">
              <h2 className="font-display text-sm font-semibold text-ink flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-ink-muted" /> {t("changeHistory")}
              </h2>
              <span className="text-xs text-brand-700 font-medium">{showHistory ? t("hide") : t("show")}</span>
            </button>
            {showHistory && <div className="mt-3">{history ? <ChangeHistoryList history={history} /> : <SkeletonRows rows={2} />}</div>}
          </div>

          {data.pastContacts.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("pastContacts")}</h2>
              <ul className="divide-y divide-line">
                {data.pastContacts.map((a) => (
                  <li key={a._id} className="flex items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="text-sm text-ink-soft">{a.personId?.name}</p>
                      <p className="text-xs text-ink-muted">{formatDate(a.fromDate)} – {formatDate(a.toDate)}</p>
                    </div>
                    <Badge tone="outline">{a.designationAtAssignment}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Modal open={addContactOpen} onClose={() => setAddContactOpen(false)} title="Add a contact" maxWidth="max-w-md">
        <div className="flex gap-2 mb-4">
          <button onClick={() => setAddMode("search")} className={`btn text-sm flex-1 border ${addMode === "search" ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>{t("existingContact")}</button>
          <button onClick={() => setAddMode("create")} className={`btn text-sm flex-1 border ${addMode === "create" ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>{t("newContact")}</button>
        </div>
        {addContactError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{addContactError}</div>}
        {addMode === "search" ? (
          <EntitySearchSelect
            label={t("searchContacts")}
            fetchResults={searchPersons}
            value={existingPerson}
            onChange={setExistingPerson}
            renderOption={(p) => (
              <div className="flex items-center justify-between gap-2">
                <div><p className="text-sm font-medium text-ink">{p.name}</p><p className="text-xs text-ink-muted">{p.phone || "No phone on file"}</p></div>
                <Badge tone={designationTone(p.designation)}>{p.designation}</Badge>
              </div>
            )}
            renderSelected={(p) => (
              <div className="flex items-center gap-2"><p className="text-sm font-medium text-ink">{p.name}</p><Badge tone={designationTone(p.designation)}>{p.designation}</Badge></div>
            )}
          />
        ) : (
          <div className="space-y-3">
            <div><label className="field-label">{t("name")} (English)</label><input className="field-input" value={newContactForm.name} onChange={(e) => setNewContactForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="field-label">{t("nameMarathi")}</label><input className="field-input" value={newContactForm.nameMr} onChange={(e) => setNewContactForm((f) => ({ ...f, nameMr: e.target.value }))} /></div>
            <div>
              <label className="field-label">{t("designation")}</label>
              <select className="field-input" value={newContactForm.designation} onChange={(e) => setNewContactForm((f) => ({ ...f, designation: e.target.value }))}>
                {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><label className="field-label">{t("designationMarathi")}</label><input className="field-input" value={newContactForm.designationMr} onChange={(e) => setNewContactForm((f) => ({ ...f, designationMr: e.target.value }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="field-label">{t("phone")}</label><input className="field-input" value={newContactForm.phone} onChange={(e) => setNewContactForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div><label className="field-label">{t("email")}</label><input type="email" className="field-input" value={newContactForm.email} onChange={(e) => setNewContactForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-4">
          <button onClick={() => handleAddContact(false)} disabled={addingContact} className="btn btn-primary">{addingContact ? t("saving") : t("addContact")}</button>
          <button onClick={() => setAddContactOpen(false)} className="btn btn-ghost">Cancel</button>
        </div>
      </Modal>

      <Modal open={Boolean(replaceConfirm)} onClose={() => setReplaceConfirm(null)} title="Replace current holder?" maxWidth="max-w-sm">
        {replaceConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">{replaceConfirm.message}</p>
            <div className="rounded-lg bg-canvas p-3 text-sm">
              <p className="flex items-center gap-2">
                <Badge tone={designationTone(replaceConfirm.conflict.designation)}>{replaceConfirm.conflict.designation}</Badge>
                <span className="font-medium text-ink">{replaceConfirm.conflict.person?.name}</span>
              </p>
              {replaceConfirm.conflict.person?.phone && (
                <p className="text-xs text-ink-muted mt-1">{replaceConfirm.conflict.person.phone}</p>
              )}
            </div>
            <p className="text-xs text-ink-muted">
              Confirming will move {replaceConfirm.conflict.person?.name} to past contacts on this Grampanchayat (and on their own
              profile) and record the change in the change history — the new person becomes the current {replaceConfirm.conflict.designation}.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => handleAddContact(true)} disabled={addingContact} className="btn btn-primary">
                {addingContact ? t("saving") : "Confirm & replace"}
              </button>
              <button onClick={() => setReplaceConfirm(null)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
