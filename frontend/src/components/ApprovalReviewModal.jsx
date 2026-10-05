import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, AlertTriangle, Save } from "lucide-react";
import Modal from "./Modal";
import Badge, { designationTone } from "./Badge";
import ChangeHistoryList from "./ChangeHistoryList";
import { DesignationOptions } from "./DesignationSelect";
import DesignationMrSelect from "./DesignationSelect";
import ContactsEditor from "./ContactsEditor";
import { changeRequestApi } from "../api/changeRequests";
import { apiErrorMessage } from "../api/client";
import { useSocketEvent } from "../context/SocketContext";
import { useLanguage } from "../context/LanguageContext";
import { applyDesignationChange } from "../utils/constants";
import { formatExactDateTime, activityTypeLabel } from "../utils/format";
import { displayName, talukaLabel } from "../utils/i18nData";

// Field catalogue for the type-aware editor. `type` drives the input control;
// unknown fields fall back to a type inferred from the value (see inferType).
const PERSON_FIELDS = [
  { key: "name", label: "Name (English)", type: "text" },
  { key: "nameMr", label: "Name (Marathi)", type: "text" },
  { key: "designation", label: "Designation", type: "designation" },
  { key: "designationMr", label: "Designation (Marathi)", type: "designationMr" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Address (English)", type: "textarea" },
  { key: "addressMr", label: "Address (Marathi)", type: "textarea" },
  { key: "district", label: "District", type: "text" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const GP_FIELDS = [
  { key: "name", label: "Name (English)", type: "text" }, { key: "nameMr", label: "Name (Marathi)", type: "text" },
  { key: "mukamPost", label: "Mukam Post", type: "text" },
  { key: "taluka", label: "Taluka", type: "text" }, { key: "talukaMr", label: "Taluka (Marathi)", type: "text" },
  { key: "district", label: "District", type: "text" }, { key: "districtMr", label: "District (Marathi)", type: "text" },
  { key: "pincode", label: "Pincode", type: "text" },
  { key: "officePhone", label: "Office phone", type: "tel" }, { key: "officeEmail", label: "Office email", type: "email" },
  { key: "population", label: "Population", type: "number" }, { key: "numberOfHouseholds", label: "Households", type: "number" },
  { key: "gpType", label: "GP type", type: "select", options: ["single", "group"] },
  { key: "waterSupplyMode", label: "Water supply", type: "select", options: ["combined", "separate"] },
  { key: "reassessmentYearFrom", label: "Reassessment from", type: "text" }, { key: "reassessmentYearTo", label: "Reassessment to", type: "text" },
  { key: "isUsingOurSoftware", label: "Uses our software", type: "boolean" },
  { key: "previousSoftwareUsed", label: "Previous software", type: "text" },
  { key: "softwareStartDate", label: "Software start date", type: "date" }, { key: "subscriptionEndDate", label: "Subscription end", type: "date" },
  { key: "subscriptionYears", label: "Subscription years", type: "number" }, { key: "priceAmount", label: "Price", type: "number" },
  { key: "paymentMode", label: "Payment mode", type: "select", options: ["cash", "upi", "bank_transfer", "cheque", "other"] },
  { key: "status", label: "Status", type: "select", options: ["active", "prospect", "inactive"] },
  { key: "taxRates", label: "Tax rates", type: "json" }, { key: "constructionRates", label: "Construction rates", type: "json" },
  { key: "landRates", label: "Land rates", type: "json" }, { key: "customFields", label: "Custom fields", type: "json" },
  { key: "contacts", label: "Contacts", type: "contacts" },
];
const GENERAL_FIELDS = [
  { key: "category", label: "Category", type: "text" }, { key: "targetArea", label: "Affected area", type: "text" },
  { key: "title", label: "Title", type: "text" }, { key: "details", label: "Details", type: "textarea" },
  { key: "requestedOutcome", label: "Expected outcome", type: "textarea" }, { key: "urgency", label: "Priority", type: "text" },
  { key: "page", label: "Page", type: "text" }, { key: "referenceId", label: "Reference", type: "text" }, { key: "metadata", label: "Metadata", type: "json" },
];

function inferType(value) {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (value && typeof value === "object") return "json";
  return "text";
}

// Which fields the editor shows, in catalogue order, then any unknown extras
// the request carries (safe fallback so nothing proposed is ever hidden).
function fieldsFor(cr) {
  const catalogue = cr.entityType === "Person" ? PERSON_FIELDS : cr.entityType === "GramPanchayat" ? GP_FIELDS : GENERAL_FIELDS;
  const proposed = cr.proposedChanges || {};
  const known = new Set(catalogue.map((f) => f.key));
  const hasContext = Boolean(cr.entityId);
  const base = catalogue.filter((f) => (f.key === "contacts" ? (cr.isNewEntity && cr.entityType === "GramPanchayat") : false) || f.key in proposed || (f.key !== "contacts" && cr.entityType !== "General" && (cr.isNewEntity || hasContext)));
  const extras = Object.keys(proposed).filter((k) => !known.has(k)).map((k) => ({ key: k, label: k, type: inferType(proposed[k]) }));
  return [...base, ...extras];
}

const show = (v) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
const toFormValue = (type, v) => (type === "contacts" ? (Array.isArray(v) ? v : []) : type === "json" ? (v === undefined || v === null ? "" : JSON.stringify(v, null, 2)) : v ?? (type === "boolean" ? false : ""));
const fromFormValue = (type, v) => {
  if (type === "contacts") return Array.isArray(v) ? v : [];
  if (type === "json") { if (String(v).trim() === "") return null; try { return JSON.parse(v); } catch { throw new Error("Invalid JSON in a structured field"); } }
  if (type === "number") return v === "" || v === null ? "" : Number(v);
  return v;
};
const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (a == null || a === "") && (b == null || b === "");

function Section({ title, children, tone }) {
  return (
    <section className={`rounded-xl border p-4 ${tone === "warn" ? "border-accent-300 bg-accent-50" : "border-line"}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">{title}</h3>
      {children}
    </section>
  );
}

function FieldControl({ field, value, onChange, disabled }) {
  const cls = "field-input w-full";
  switch (field.type) {
    case "designation":
      return <select className={cls} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option><DesignationOptions /></select>;
    case "select":
      return <select className={cls} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{field.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    case "designationMr":
      return <DesignationMrSelect value={value} disabled={disabled} onChange={onChange} />;
    case "contacts":
      return <ContactsEditor value={value || []} onChange={onChange} disabled={disabled} />;
    case "boolean":
      return <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    case "textarea":
      return <textarea className={`${cls} min-h-16`} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    case "json":
      return <textarea className={`${cls} min-h-24 font-mono text-xs`} disabled={disabled} value={value || ""} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className={cls} disabled={disabled} type={field.type === "date" ? "date" : field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
        value={field.type === "date" && value ? String(value).slice(0, 10) : value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

const gpLine = (gp, lang) => (gp ? [displayName(gp, lang).primary, talukaLabel(gp, lang)].filter(Boolean).join(", ") : "—");
const personLine = (p) => (p ? [p.name || p.nameMr, p.nameMr && p.name ? `(${p.nameMr})` : null, p.phone, p.designation && (p.designation)].filter(Boolean).join(" · ") : "—");

export default function ApprovalReviewModal({ requestId, onClose, onChanged }) {
  const { language } = useLanguage();
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  function load(resetForm) {
    return changeRequestApi.get(requestId).then((d) => {
      setDetail(d);
      if (resetForm) {
        const cr = d.changeRequest;
        const next = {};
        for (const f of fieldsFor(cr)) next[f.key] = toFormValue(f.type, cr.proposedChanges?.[f.key]);
        setForm(next);
        setDirty(false);
      }
    }).catch((e) => setError(apiErrorMessage(e)));
  }
  useEffect(() => { setDetail(null); setError(""); setRejecting(false); if (requestId) load(true); }, [requestId]);

  // Live: someone (or another admin tab) changed this request - refresh context,
  // but never clobber edits the admin is in the middle of.
  useSocketEvent("changeRequest:updated", (cr) => { if (requestId && String(cr?._id) === String(requestId)) load(!dirtyRef.current); });

  const cr = detail?.changeRequest;
  const fields = useMemo(() => (cr ? fieldsFor(cr) : []), [cr]);
  const pending = cr?.status === "pending";
  const editableAction = cr && cr.action !== "change_workplace" && !(cr.action === "replace_contact" && !cr.isNewEntity);
  const live = detail?.currentEntity;

  function setField(key, value) {
    setDirty(true);
    setForm((f) => (("designation" === key || "designationMr" === key) && "designationMr" in f && "designation" in f
      ? applyDesignationChange(f, key, value)
      : { ...f, [key]: value }));
  }

  function buildEdits() {
    const edits = {};
    for (const f of fields) {
      if (!(f.key in form)) continue;
      const value = fromFormValue(f.type, form[f.key]);
      if (!sameVal(value, cr.proposedChanges?.[f.key])) edits[f.key] = value;
    }
    return edits;
  }

  async function run(fn) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error && !e.response ? e.message : apiErrorMessage(e)); } finally { setBusy(false); }
  }

  const saveOnly = () => run(async () => {
    const edits = buildEdits();
    if (Object.keys(edits).length) { await changeRequestApi.update(cr._id, edits); onChanged?.(); }
    await load(true);
  });

  const approve = (withEdits) => run(async () => {
    const edits = withEdits ? buildEdits() : undefined;
    const opts = { reviewNote: reviewNote || undefined };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await changeRequestApi.approve(cr._id, edits && Object.keys(edits).length ? edits : undefined, opts);
        onChanged?.(); onClose(); return;
      } catch (err) {
        const data = err?.response?.data;
        if (data?.error === "ALREADY_HAS_HOLDER" && !opts.confirmReplaceHolder && window.confirm(`${data.message} Continue?`)) { opts.confirmReplaceHolder = true; continue; }
        if (data?.error === "STALE_REQUEST" && !opts.confirmStale && window.confirm(`${data.message}\nChanged since submission: ${data.staleFields.join(", ")}. Apply anyway?`)) { opts.confirmStale = true; continue; }
        throw err;
      }
    }
  });

  const reject = () => run(async () => { await changeRequestApi.reject(cr._id, reviewNote || undefined); onChanged?.(); onClose(); });

  const title = !cr ? "Review request"
    : cr.action === "change_workplace" ? "Workplace change"
    : cr.action === "replace_contact" ? "Replace Grampanchayat contact"
    : cr.entityType === "General" ? "General change suggestion"
    : `${cr.isNewEntity ? "New" : "Update"} ${cr.entityType === "Person" ? "contact" : "Grampanchayat"}`;

  return (
    <Modal open={Boolean(requestId)} onClose={onClose} title={title} maxWidth="max-w-5xl">
      {!detail ? <p className="text-sm text-ink-muted py-8 text-center">{error || "Loading…"}</p> : (
        <div className="space-y-4">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}

          <Section title="Request">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <p><span className="text-ink-muted">Status: </span><Badge tone={cr.status === "approved" ? "brand" : cr.status === "rejected" ? "signal" : "accent"}>{cr.status}</Badge></p>
              <p><span className="text-ink-muted">Submitted by: </span>{cr.proposedBy?.name || "unknown"}{cr.proposedBy?.team ? ` (${cr.proposedBy.team})` : ""}</p>
              <p><span className="text-ink-muted">Submitted at: </span>{formatExactDateTime(cr.createdAt)}</p>
              {cr.reviewedAt && <p><span className="text-ink-muted">Reviewed: </span>{cr.reviewedBy?.name || "—"} · {formatExactDateTime(cr.reviewedAt)}</p>}
              {cr.gramPanchayatId && <p><span className="text-ink-muted">Grampanchayat: </span><Link className="underline" to={`/admin/grampanchayats/${cr.gramPanchayatId._id}`}>{gpLine(cr.gramPanchayatId, language)}</Link></p>}
              {cr.entityType === "Person" && cr.entityId && <p><span className="text-ink-muted">Contact: </span><Link className="underline" to={`/admin/contacts/${cr.entityId}`}>View current record</Link></p>}
              {cr.entityType === "GramPanchayat" && cr.entityId && <p><span className="text-ink-muted">Record: </span><Link className="underline" to={`/admin/grampanchayats/${cr.entityId}`}>View current record</Link></p>}
            </div>
            {cr.reason && <p className="text-sm italic text-ink-soft mt-2">“{cr.reason}”</p>}
            {cr.reviewNote && <p className="text-sm text-signal-600 mt-2">Review note: {cr.reviewNote}</p>}
          </Section>

          {pending && detail.staleFields?.length > 0 && (
            <Section title="Record changed since submission" tone="warn">
              <p className="text-sm flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 text-accent-700" /> Live value differs from the snapshot for: <b>{detail.staleFields.join(", ")}</b>. Compare the “Current (live)” column before approving; you will be asked to confirm.</p>
            </Section>
          )}
          {pending && detail.holderConflict && (
            <Section title="Designation conflict" tone="warn">
              <p className="text-sm flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 text-accent-700" /> {personLine(detail.holderConflict.person)} already holds {(detail.holderConflict.designation)} here. Approving will ask to move them to past contacts.</p>
            </Section>
          )}

          {cr.action === "change_workplace" && (
            <Section title="Workplace change">
              <p className="text-sm">{cr.previousValues?.contact}</p>
              <p className="text-sm mt-1"><span className="text-ink-muted line-through">{detail.fromGramPanchayat ? gpLine(detail.fromGramPanchayat, language) : cr.previousValues?.workplace || "No current posting"}</span> → <b>{gpLine(cr.gramPanchayatId, language)}</b></p>
            </Section>
          )}
          {cr.action === "replace_contact" && (
            <Section title="Contact replacement">
              <p className="text-sm"><span className="text-ink-muted">Current contact: </span>{personLine(detail.replacesPerson || cr.previousValues)}</p>
              <p className="text-sm mt-1"><span className="text-ink-muted">Replaced by: </span><b>{personLine(cr.proposedChanges)}</b>{cr.isNewEntity && " (new person)"}</p>
            </Section>
          )}

          {fields.length > 0 && (
            <Section title={pending && editableAction ? "Current vs proposed — edit the final values" : "Current vs proposed"}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead><tr className="text-left text-xs text-ink-muted">
                    <th className="py-1 pr-3 w-36">Field</th><th className="pr-3">Current (live)</th><th className="pr-3">Employee proposed</th><th>{pending && editableAction ? "Final (editable)" : "Applied"}</th>
                  </tr></thead>
                  <tbody>
                    {fields.map((f) => {
                      const original = cr.originalProposedChanges?.[f.key] ?? cr.proposedChanges?.[f.key];
                      const changedByAdmin = cr.originalProposedChanges && !sameVal(cr.originalProposedChanges[f.key], cr.proposedChanges?.[f.key]);
                      const liveValue = live ? live[f.key] : cr.previousValues?.[f.key];
                      return (
                        <tr key={f.key} className="border-t border-line align-top">
                          <td className="py-2 pr-3 text-xs text-ink-muted">{f.label}</td>
                          <td className="py-2 pr-3 text-ink-soft break-words max-w-[14rem]">{cr.isNewEntity ? "—" : show(liveValue)}</td>
                          <td className="py-2 pr-3 break-words max-w-[14rem]">{f.type === "designation" && original ? (original) : show(original)}</td>
                          <td className="py-2 min-w-[12rem]">
                            {pending && editableAction
                              ? <FieldControl field={f} value={form[f.key]} onChange={(v) => setField(f.key, v)} disabled={busy} />
                              : <span className={`font-medium ${changedByAdmin ? "text-accent-700" : ""}`}>{f.type === "designation" ? (cr.proposedChanges?.[f.key]) : show(cr.proposedChanges?.[f.key])}{changedByAdmin && " (admin edited)"}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {cr.entityType === "Person" && form.designation && (
                <p className="text-xs text-ink-muted mt-2">Designation is stored as <b>{form.designation}</b>; the Marathi label is editable and is never machine-translated for names.</p>
              )}
            </Section>
          )}

          {detail.relatedActivity && (
            <Section title="Related activity">
              <p className="text-sm"><b>{activityTypeLabel(detail.relatedActivity.type)}</b> by {detail.relatedActivity.employeeId?.name || "—"} · {formatExactDateTime(detail.relatedActivity.date)}</p>
              <p className="text-sm text-ink-soft mt-1 whitespace-pre-wrap">{detail.relatedActivity.notes}</p>
              <Link to="/admin/explorer" className="text-xs underline text-ink-muted">Open Explorer</Link>
            </Section>
          )}

          {detail.assignments?.length > 0 && (
            <Section title="Postings of this contact">
              <ul className="text-sm divide-y divide-line">
                {detail.assignments.map((a) => (
                  <li key={a._id} className="py-1.5 flex flex-wrap gap-x-3">
                    <Link className="underline" to={`/admin/grampanchayats/${a.gramPanchayatId?._id}`}>{gpLine(a.gramPanchayatId, language)}</Link>
                    <Badge tone={designationTone(a.designationAtAssignment)}>{(a.designationAtAssignment)}</Badge>
                    <span className="text-ink-muted">{formatExactDateTime(a.fromDate)} → {a.toDate ? formatExactDateTime(a.toDate) : "current"}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {detail.currentContacts?.length > 0 && (
            <Section title="Contacts at this Grampanchayat">
              <ul className="text-sm divide-y divide-line">
                {detail.currentContacts.map((a) => (
                  <li key={a._id} className="py-1.5 flex flex-wrap gap-x-3 items-center">
                    {a.personId ? <Link className="underline" to={`/admin/contacts/${a.personId._id}`}>{personLine(a.personId)}</Link> : "—"}
                    <Badge tone={a.toDate ? "outline" : "brand"}>{a.toDate ? "past" : "current"}</Badge>
                    <span className="text-ink-muted">{formatExactDateTime(a.fromDate)}{a.toDate ? ` → ${formatExactDateTime(a.toDate)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {cr.editHistory?.length > 0 && (
            <Section title="Admin edits on this request">
              <ul className="text-sm space-y-2">
                {cr.editHistory.map((h, i) => (
                  <li key={i}>
                    <span className="text-ink-muted">{h.editedBy?.name || "Admin"} · {formatExactDateTime(h.editedAt)}</span>
                    {Object.entries(h.changes || {}).map(([k, v]) => <p key={k} className="ml-3"><b>{k}</b>: <span className="line-through text-ink-muted">{show(v.from)}</span> → {show(v.to)}</p>)}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {detail.history?.length > 0 && <Section title="Change history of this record"><ChangeHistoryList history={detail.history} /></Section>}

          {pending && (
            <Section title="Review">
              <textarea className="field-input w-full min-h-14 text-sm" placeholder="Review note (optional, saved with the decision)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              <div className="flex flex-wrap gap-2 pt-3">
                {editableAction && <button disabled={busy || !dirty} onClick={saveOnly} className="btn btn-outline"><Save className="h-4 w-4" /> Save changes</button>}
                {editableAction && <button disabled={busy} onClick={() => approve(true)} className="btn btn-primary"><CheckCircle2 className="h-4 w-4" /> {dirty ? "Save & Approve" : "Approve"}</button>}
                {!editableAction && <button disabled={busy} onClick={() => approve(false)} className="btn btn-primary"><CheckCircle2 className="h-4 w-4" /> Approve</button>}
                <button disabled={busy} onClick={() => (rejecting ? reject() : setRejecting(true))} className="btn btn-outline text-signal-600 border-signal-300 hover:bg-signal-50"><XCircle className="h-4 w-4" /> {rejecting ? "Confirm reject" : "Reject"}</button>
                <button onClick={onClose} className="btn btn-ghost ml-auto">Close</button>
              </div>
            </Section>
          )}
        </div>
      )}
    </Modal>
  );
}
