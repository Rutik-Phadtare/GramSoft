import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, FileText, CreditCard, Users, Pencil, UserPlus, Replace } from "lucide-react";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { personApi } from "../../api/persons";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge, { designationTone, softwareStatusTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate, softwareStatusLabel, paymentModeLabel } from "../../utils/format";
import { nameLine, placeLine, displayName } from "../../utils/i18nData";
import { DESIGNATIONS } from "../../utils/constants";
import { DesignationOptions } from "../../components/DesignationSelect";
import DesignationMrSelect from "../../components/DesignationSelect";
import { applyDesignationChange } from "../../utils/constants";

const GP_FIELDS = [
  ["name", "Name (English)"], ["nameMr", "Name (Marathi)"], ["mukamPost", "Mukam / Post"],
  ["taluka", "Taluka"], ["district", "District"], ["pincode", "Pincode"], ["officePhone", "Office phone"],
  ["officeEmail", "Office email"], ["population", "Population"], ["numberOfHouseholds", "Number of households"],
  ["gpType", "GP type"], ["waterSupplyMode", "Water supply mode"], ["reassessmentYearFrom", "Reassessment year from"],
  ["reassessmentYearTo", "Reassessment year to"], ["isUsingOurSoftware", "Using GramSoft"], ["previousSoftwareUsed", "Previous software"],
  ["softwareStartDate", "Software start date"], ["subscriptionEndDate", "Subscription end date"], ["subscriptionYears", "Subscription years"],
  ["priceAmount", "Price amount"], ["paymentMode", "Payment mode"], ["status", "GP status"],
];

const RATE_FIELDS = ["taxRates", "constructionRates", "landRates", "customFields"];

// Contact (Person) fields an employee can propose. Same set the Contacts
// page and the change-request API accept.
const CONTACT_FIELDS = [
  ["name", "Name (English)"], ["nameMr", "Name (Marathi)"], ["designation", "Designation"], ["designationMr", "Designation (Marathi)"], ["phone", "Phone"],
  ["email", "Email"], ["district", "District"], ["address", "Address (English)"], ["addressMr", "Address (Marathi)"], ["notes", "Notes"],
];
const EMPTY_CONTACT = Object.fromEntries(CONTACT_FIELDS.map(([k]) => [k, ""]));
const personLine = (p) => [p?.name || p?.nameMr, p?.phone || "No phone", p?.designation].filter(Boolean).join(" | ");

function inputValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function parseValue(key, value) {
  if (RATE_FIELDS.includes(key)) {
    try { return JSON.parse(value); } catch { throw new Error(`${key} must contain valid JSON.`); }
  }
  if (["population", "numberOfHouseholds", "subscriptionYears", "priceAmount"].includes(key) && value !== "") {
    return Number(value);
  }
  if (key === "isUsingOurSoftware") return value === "true";
  return value;
}

export default function EmployeeGramPanchayatDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeForm, setProposeForm] = useState({});
  const [proposeError, setProposeError] = useState("");
  const [proposeSaving, setProposeSaving] = useState(false);
  const [proposed, setProposed] = useState(false);

  const canPropose = user?.role === "admin" || user?.permissions?.editGramPanchayats !== false;

  // Contact proposals for this GP: a new contact, an update to an existing
  // one, or replacing the current one. All go to the normal approval queue.
  const canProposeContact = user?.role === "admin" || user?.permissions?.editContacts !== false;
  const canSearchContacts = user?.role === "admin" || user?.permissions?.viewContacts !== false;
  const [cp, setCp] = useState(null); // { mode: "new" | "update" | "replace", person?: current contact }
  const [cpForm, setCpForm] = useState(EMPTY_CONTACT);
  const [cpReplacement, setCpReplacement] = useState(null); // existing directory person, replace mode
  const [cpUseExisting, setCpUseExisting] = useState(false);
  const [cpReason, setCpReason] = useState("");
  const [cpError, setCpError] = useState("");
  const [cpSaving, setCpSaving] = useState(false);
  const [cpDone, setCpDone] = useState(false);

  function refresh() {
    gramPanchayatApi.get(id).then((d) => {
      setData(d);
      const next = {};
      for (const [key] of GP_FIELDS) next[key] = inputValue(d.gramPanchayat[key]);
      for (const key of RATE_FIELDS) next[key] = inputValue(d.gramPanchayat[key]);
      setProposeForm(next);
    }).finally(() => setLoading(false));
  }
  useEffect(refresh, [id]);

  function openPropose() {
    setProposeError("");
    setProposed(false);
    setProposeOpen(true);
  }

  async function submitPropose(e) {
    e.preventDefault();
    setProposeSaving(true);
    setProposeError("");
    try {
      const changes = {};
      const gp = data.gramPanchayat;
      for (const [key] of GP_FIELDS) {
        const next = parseValue(key, proposeForm[key] ?? "");
        const current = gp[key] ?? "";
        if (String(next) !== String(current)) changes[key] = next;
      }
      for (const key of RATE_FIELDS) {
        const next = parseValue(key, proposeForm[key] ?? "");
        if (JSON.stringify(next) !== JSON.stringify(gp[key] ?? (key === "customFields" ? {} : []))) changes[key] = next;
      }
      if (!Object.keys(changes).length) throw new Error("Change something before submitting.");
      await changeRequestApi.create({ entityType: "GramPanchayat", entityId: id, proposedChanges: changes, reason: "Employee proposed an update from the Grampanchayat detail page" });
      setProposed(true);
    } catch (err) {
      setProposeError(err instanceof Error ? err.message : apiErrorMessage(err));
    } finally {
      setProposeSaving(false);
    }
  }

  function openContactProposal(mode, person) {
    setCp({ mode, person });
    setCpForm(mode === "update" ? { ...EMPTY_CONTACT, ...Object.fromEntries(CONTACT_FIELDS.map(([k]) => [k, person?.[k] || ""])) } : EMPTY_CONTACT);
    setCpReplacement(null);
    setCpUseExisting(false);
    setCpReason("");
    setCpError("");
    setCpDone(false);
  }

  const searchContacts = (q) => personApi.list({ q }).then((d) => d.results);

  async function submitContactProposal(e) {
    e.preventDefault();
    setCpError("");
    const { mode, person } = cp;
    const trimmed = Object.fromEntries(CONTACT_FIELDS.map(([k]) => [k, String(cpForm[k] || "").trim()]));
    const reason = cpReason.trim();
    let payload;

    if (mode === "update") {
      // Only fields that were changed, or filled in where nothing is shown on this page.
      const changes = {};
      for (const [k] of CONTACT_FIELDS) if (trimmed[k] && trimmed[k] !== (person?.[k] || "")) changes[k] = trimmed[k];
      if (!Object.keys(changes).length) return setCpError("Change something before submitting.");
      payload = { entityType: "Person", entityId: person._id, proposedChanges: changes, reason: reason || `Employee proposed an update from the ${gp.name || gp.nameMr} Grampanchayat page` };
    } else {
      const useExisting = mode === "replace" && cpUseExisting;
      if (useExisting) {
        if (!cpReplacement) return setCpError("Pick the contact who replaces them.");
      } else {
        if (!trimmed.name) return setCpError("A name is required.");
        if (!trimmed.designation) return setCpError("A designation is required.");
      }
      const changes = Object.fromEntries(Object.entries(trimmed).filter(([, v]) => v));
      if (mode === "new") {
        payload = { entityType: "Person", entityId: null, gramPanchayatId: id, proposedChanges: changes, reason: reason || "Employee proposed a new contact from the Grampanchayat page" };
      } else {
        payload = {
          entityType: "Person", action: "replace_contact", gramPanchayatId: id, replacesPersonId: person._id,
          ...(useExisting ? { entityId: cpReplacement._id } : { proposedChanges: changes }),
          reason: reason || "Employee proposed replacing this Grampanchayat contact",
        };
      }
    }

    setCpSaving(true);
    try {
      await changeRequestApi.create(payload);
      setCpDone(true);
    } catch (err) {
      setCpError(apiErrorMessage(err));
    } finally {
      setCpSaving(false);
    }
  }

  if (loading || !data) return <div className="max-w-3xl"><SkeletonRows rows={6} /></div>;
  const gp = data.gramPanchayat;

  return (
    <div>
      <Link to="/grampanchayats" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-soft mb-4"><ArrowLeft className="h-3.5 w-3.5" /> Back to Grampanchayats</Link>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {placeLine(gp, language)}</span>}
        title={nameLine(gp, language)}
        action={canPropose ? <button onClick={openPropose} className="btn btn-outline"><Pencil className="h-4 w-4" /> Propose a change</button> : null}
      />

      <div className="flex flex-wrap gap-2 mb-6"><Badge tone={softwareStatusTone(gp.softwareUsageStatus)}>{softwareStatusLabel(gp.softwareUsageStatus)}</Badge>{gp.population != null && <Badge tone="outline">Population {gp.population.toLocaleString("en-IN")}</Badge>}</div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-5"><h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-ink-muted" /> {t("registrationDetails")}</h2><dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-ink-muted">{t("mukamPost")}</dt><dd className="font-medium text-ink">{gp.mukamPost || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">{t("pincode")}</dt><dd className="font-medium text-ink">{gp.pincode || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">{t("officePhone")}</dt><dd className="font-medium text-ink">{gp.officePhone || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">{t("officeEmail")}</dt><dd className="font-medium text-ink">{gp.officeEmail || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">GP type</dt><dd className="font-medium text-ink">{gp.gpType || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">Water supply</dt><dd className="font-medium text-ink">{gp.waterSupplyMode || "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">Reassessment</dt><dd className="font-medium text-ink">{gp.reassessmentYearFrom || "—"} {gp.reassessmentYearTo ? `→ ${gp.reassessmentYearTo}` : ""}</dd></div>
            <div><dt className="text-xs text-ink-muted">Households</dt><dd className="font-medium text-ink">{gp.numberOfHouseholds ?? "—"}</dd></div>
          </dl></div>

          {(gp.softwareStartDate !== undefined || gp.priceAmount !== undefined) && <div className="card p-5"><h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4 text-ink-muted" /> {t("softwareAndBilling")}</h2><dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div><dt className="text-xs text-ink-muted">{t("status")}</dt><dd className="font-medium text-ink">{softwareStatusLabel(gp.softwareUsageStatus)}</dd></div>
            <div><dt className="text-xs text-ink-muted">{t("started")}</dt><dd className="font-medium text-ink">{gp.softwareStartDate ? formatDate(gp.softwareStartDate) : "—"}</dd></div>
            <div><dt className="text-xs text-ink-muted">{t("paymentMode")}</dt><dd className="font-medium text-ink">{gp.paymentMode ? paymentModeLabel(gp.paymentMode) : "—"}</dd></div>
          </dl></div>}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-display text-sm font-semibold text-ink flex items-center gap-2"><Users className="h-4 w-4 text-ink-muted" /> {t("currentContacts")}</h2>
            {canProposeContact && <button type="button" onClick={() => openContactProposal("new")} className="btn btn-outline text-xs py-1.5"><UserPlus className="h-3.5 w-3.5" /> Propose new contact</button>}
          </div>
          {data.currentContacts.length === 0 ? <EmptyState title={t("noCurrentContact")} /> : <ul className="divide-y divide-line">{data.currentContacts.map((a) => <li key={a._id} className="py-2.5"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-ink">{nameLine(a.personId, language)}</p><Badge tone={designationTone(a.designationAtAssignment)}>{a.designationAtAssignment}</Badge></div><p className="text-xs text-ink-muted">{a.personId?.phone || "No phone on file"}</p>{canProposeContact && a.personId && <div className="mt-1.5 flex flex-wrap gap-2"><button type="button" onClick={() => openContactProposal("update", a.personId)} className="btn btn-outline text-xs py-1"><Pencil className="h-3 w-3" /> Propose update</button><button type="button" onClick={() => openContactProposal("replace", a.personId)} className="btn btn-outline text-xs py-1"><Replace className="h-3 w-3" /> Replace contact</button></div>}</li>)}</ul>}
        </div>
      </div>

      <Modal open={proposeOpen} onClose={() => setProposeOpen(false)} title="Propose Grampanchayat changes" maxWidth="max-w-3xl">
        {proposed ? <div className="space-y-4"><p className="text-sm text-ink-soft">Your proposal was sent to admin review. Nothing changes in the live directory until approval.</p><button onClick={() => setProposeOpen(false)} className="btn btn-primary">Done</button></div> : <form onSubmit={submitPropose} className="space-y-4">
          {proposeError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{proposeError}</div>}
          <p className="text-xs text-ink-muted">Every editable GP detail is available here. For rate/custom-field sections, keep the existing JSON structure and change only what you know is incorrect.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {GP_FIELDS.map(([key, label]) => <div key={key}><label className="field-label">{label}</label>{["gpType","waterSupplyMode","paymentMode","status","isUsingOurSoftware"].includes(key) ? <select className="field-input" value={proposeForm[key]} onChange={(e) => setProposeForm((f) => ({ ...f, [key]: e.target.value }))}><option value="">—</option>{key === "gpType" && <><option value="single">Single GP</option><option value="group">Group GP</option></>}{key === "waterSupplyMode" && <><option value="combined">Combined</option><option value="separate">Separate</option></>}{key === "paymentMode" && <><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></>}{key === "status" && <><option value="prospect">Prospect</option><option value="active">Active</option><option value="inactive">Inactive</option></>}{key === "isUsingOurSoftware" && <><option value="true">Yes</option><option value="false">No</option></>}</select> : <input className="field-input" value={proposeForm[key]} onChange={(e) => setProposeForm((f) => ({ ...f, [key]: e.target.value }))} />}</div>)}
            {RATE_FIELDS.map((key) => <div key={key} className="sm:col-span-2"><label className="field-label">{key}</label><textarea className="field-textarea font-mono text-xs" rows={key === "customFields" ? 5 : 8} value={proposeForm[key]} onChange={(e) => setProposeForm((f) => ({ ...f, [key]: e.target.value }))} /></div>)}
          </div>
          <div className="flex gap-3 pt-1"><button type="submit" disabled={proposeSaving} className="btn btn-primary">{proposeSaving ? t("saving") : "Submit for approval"}</button><button type="button" onClick={() => setProposeOpen(false)} className="btn btn-ghost">{t("cancel")}</button></div>
        </form>}
      </Modal>

      <Modal open={Boolean(cp)} onClose={() => setCp(null)} title={cp?.mode === "new" ? "Propose new contact" : cp?.mode === "update" ? "Propose contact update" : "Propose contact replacement"} maxWidth="max-w-2xl">
        {cp && (cpDone ? (
          <div className="space-y-4"><p className="text-sm text-ink-soft">Your proposal was sent to admin review. Nothing changes in the live directory until it is approved.</p><button type="button" onClick={() => setCp(null)} className="btn btn-primary">Done</button></div>
        ) : (
          <form onSubmit={submitContactProposal} className="space-y-4">
            {cpError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{cpError}</div>}
            {cp.mode === "replace" && (
              <div className="rounded-lg bg-canvas px-3 py-2 text-sm">
                <p className="text-xs text-ink-muted">Current contact</p>
                <p className="font-medium text-ink">{personLine(cp.person)}</p>
              </div>
            )}
            {cp.mode === "update" && <p className="text-xs text-ink-muted">Editing {personLine(cp.person)}. Fields not shown on this page start blank - fill in only what should change.</p>}
            {cp.mode === "replace" && canSearchContacts && (
              <div className="flex gap-2">
                <button type="button" onClick={() => setCpUseExisting(false)} className={`btn text-sm border ${!cpUseExisting ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>New person</button>
                <button type="button" onClick={() => setCpUseExisting(true)} className={`btn text-sm border ${cpUseExisting ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>Existing contact</button>
              </div>
            )}
            {cp.mode === "replace" && cpUseExisting ? (
              <EntitySearchSelect
                label="Replaced by *"
                placeholder="Search contacts by name or phone…"
                fetchResults={searchContacts}
                value={cpReplacement}
                onChange={setCpReplacement}
                emptyHint="No matching contact found."
                renderOption={(p) => <p className="text-sm font-medium text-ink">{personLine(p)}</p>}
                renderSelected={(p) => <p className="text-sm font-medium text-ink">{personLine(p)}</p>}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {CONTACT_FIELDS.map(([key, label]) => (
                  <div key={key} className={key.startsWith("address") || key === "notes" ? "sm:col-span-2" : ""}>
                    <label className="field-label">{label}{cp.mode !== "update" && (key === "name" || key === "designation") ? " *" : ""}</label>
                    {key === "designation" ? (
                      <select className="field-input" value={cpForm.designation} onChange={(e) => setCpForm((f) => applyDesignationChange(f, "designation", e.target.value))}>
                        <option value="">Select…</option>
                        <DesignationOptions />
                      </select>
                    ) : key === "designationMr" ? (
                      <DesignationMrSelect value={cpForm.designationMr} onChange={(v) => setCpForm((f) => applyDesignationChange(f, "designationMr", v))} />
                    ) : (
                      <input className="field-input" value={cpForm[key]} onChange={(e) => setCpForm((f) => ({ ...f, [key]: e.target.value }))} />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="field-label">Reason (optional)</label>
              <textarea className="field-textarea" rows={2} value={cpReason} onChange={(e) => setCpReason(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-1"><button type="submit" disabled={cpSaving} className="btn btn-primary">{cpSaving ? t("saving") : "Submit for approval"}</button><button type="button" onClick={() => setCp(null)} className="btn btn-ghost">{t("cancel")}</button></div>
          </form>
        ))}
      </Modal>
    </div>
  );
}
