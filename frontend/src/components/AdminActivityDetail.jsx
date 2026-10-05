import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, History } from "lucide-react";
import Modal from "./Modal";
import Badge, { designationTone, clientInterestTone } from "./Badge";
import { activityApi } from "../api/activities";
import { formatDate, formatDateTime, formatExactDateTime, activityTypeLabel } from "../utils/format";
import { displayName } from "../utils/i18nData";
import { useLanguage } from "../context/LanguageContext";

const NP = "Not provided";

// Same labels the history list uses, plus the extra person fields.
const FIELD_LABELS = {
  name: "Name", nameMr: "Name (Marathi)", designation: "Designation", designationMr: "Designation (Marathi)",
  phone: "Phone", email: "Email", address: "Address", addressMr: "Address (Marathi)", district: "District",
  notes: "Notes", workplace: "Workplace", contact: "Contact",
};
// Database ids that only wire proposals together - the readable label sits beside them.
const HIDDEN_KEYS = new Set(["gramPanchayatId", "replacesPersonId"]);

// Known top-level activity keys shown in dedicated sections; anything else
// stored on the record is listed under "Additional information".
const KNOWN_KEYS = new Set([
  "_id", "__v", "employeeId", "date", "type", "gramPanchayatId", "personId", "designationSnapshot", "notes",
  "clientInterest", "problemSolved", "durationMinutes", "nextFollowUpDate", "customFields", "newContactProposal", "createdAt", "updatedAt",
]);

const STATUS_TONE = { pending: "accent", approved: "brand", rejected: "signal" };

function show(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(show).filter(Boolean).join(", ") || null;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([k]) => !HIDDEN_KEYS.has(k))
      .map(([k, v]) => [FIELD_LABELS[k] || k, show(v)])
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ") || null;
  }
  return String(value);
}

const prettyKey = (k) => k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Full, read-only record of one activity for Admin: everything the employee
// submitted, the contact (existing or proposed), linked proposals with
// before/after, and the audit history. Data comes from GET /api/activities/:id.
export default function AdminActivityDetail({ activityId, open, onClose }) {
  const { language } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open || !activityId) return;
    setData(null);
    setError("");
    activityApi
      .get(activityId)
      .then(setData)
      .catch((err) => setError(err?.response?.data?.error || "Could not load this activity."));
  }, [open, activityId]);

  async function download() {
    setDownloading(true);
    try {
      await activityApi.downloadOne(activityId);
    } finally {
      setDownloading(false);
    }
  }

  const entry = data?.entry;
  const labelFor = (key) => data?.customFieldDefs?.find((d) => d.key === key)?.label || prettyKey(key);
  const gp = entry?.gramPanchayatId;
  const person = entry?.personId;
  const np = data?.newContactProposal;
  const customEntries = Object.entries(entry?.customFields || {}).filter(([, v]) => show(v));
  const extraEntries = entry ? Object.entries(entry).filter(([k, v]) => !KNOWN_KEYS.has(k) && show(v)) : [];
  const linked = (data?.proposals || []).filter((p) => p.linkedToActivity);
  const related = (data?.proposals || []).filter((p) => !p.linkedToActivity);

  return (
    <Modal open={open} onClose={onClose} title="Activity details" maxWidth="max-w-2xl">
      {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
      {!error && !entry && <p className="text-sm text-ink-muted py-6 text-center">Loading…</p>}

      {entry && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{activityTypeLabel(entry.type)}</Badge>
            {entry.clientInterest && <Badge tone={clientInterestTone(entry.clientInterest)}>{activityTypeLabel(entry.clientInterest)}</Badge>}
            {linked.length > 0 && <Badge tone={STATUS_TONE[linked[linked.length - 1].status]}>Proposal {linked[linked.length - 1].status}</Badge>}
            <button type="button" onClick={download} disabled={downloading} className="btn btn-outline text-sm py-1.5 ml-auto">
              <Download className="h-3.5 w-3.5" /> {downloading ? "Preparing…" : "Download"}
            </button>
          </div>

          <Section title="Activity information">
            <Field label="Activity date & time">{formatExactDateTime(entry.date)}</Field>
            <Field label="Logged at">{entry.createdAt ? formatExactDateTime(entry.createdAt) : NP}</Field>
            <Field label="Activity type">{activityTypeLabel(entry.type)}</Field>
            <Field label="Duration">{entry.durationMinutes ? `${entry.durationMinutes} min` : NP}</Field>
          </Section>

          <Section title="Employee">
            <Field label="Name">{entry.employeeId?.name || NP}</Field>
            <Field label="Team / role">{[entry.employeeId?.team, entry.employeeId?.role].filter(Boolean).join(" · ") || NP}</Field>
            <Field label="Email">{entry.employeeId?.email || NP}</Field>
            <Field label="Phone">{entry.employeeId?.phone || NP}</Field>
          </Section>

          <Section title="Gram Panchayat">
            {gp ? (
              <>
                <Field label="Name">
                  <Link to={`/admin/grampanchayats/${gp._id}`} className="hover:underline">{displayName(gp, language).primary}</Link>
                </Field>
                <Field label="Taluka / District">{[gp.taluka, gp.district].filter(Boolean).join(", ") || NP}</Field>
                <Field label="Office phone">{gp.officePhone || NP}</Field>
                <Field label="Office email">{gp.officeEmail || NP}</Field>
              </>
            ) : (
              <Field label="Name" full>{NP}</Field>
            )}
          </Section>

          <Section title="Contact">
            {person ? (
              <>
                <Field label="Name">
                  <Link to={`/admin/contacts/${person._id}`} className="hover:underline">{displayName(person, language).primary}</Link>
                </Field>
                <Field label="Designation">
                  {person.designation ? <Badge tone={designationTone(person.designation)}>{person.designation}</Badge> : NP}
                  {entry.designationSnapshot && entry.designationSnapshot !== person.designation && (
                    <span className="text-xs text-ink-muted ml-2">(was {entry.designationSnapshot} at the time)</span>
                  )}
                </Field>
                <Field label="Phone">{person.phone || NP}</Field>
                <Field label="Email">{person.email || NP}</Field>
                <Field label="Address" full>{[person.address, person.addressMr].filter(Boolean).join(" / ") || NP}</Field>
                {person.notes && <Field label="Contact notes" full>{person.notes}</Field>}
              </>
            ) : (
              <Field label="Existing contact" full>{np ? "None selected - a new contact was proposed (below)" : NP}</Field>
            )}
          </Section>

          {np && (
            <Section title="New contact proposal">
              {Object.entries(np).filter(([, v]) => show(v)).map(([k, v]) => (
                <Field key={k} label={FIELD_LABELS[k] || prettyKey(k)} full={k === "address" || k === "addressMr" || k === "notes"}>{show(v)}</Field>
              ))}
            </Section>
          )}

          <Section title="Conversation / activity details" cols={1}>
            <Field label="Notes" full>
              <span className="block whitespace-pre-wrap bg-canvas rounded-lg p-3 font-normal text-ink-soft">{entry.notes || NP}</span>
            </Field>
            {entry.problemSolved && <Field label="Problem solved" full>{entry.problemSolved}</Field>}
            {entry.nextFollowUpDate && <Field label="Next follow-up">{formatDate(entry.nextFollowUpDate)}</Field>}
          </Section>

          {(customEntries.length > 0 || extraEntries.length > 0) && (
            <Section title="Additional information">
              {customEntries.map(([k, v]) => (
                <Field key={k} label={labelFor(k)}>{show(v)}</Field>
              ))}
              {extraEntries.map(([k, v]) => (
                <Field key={k} label={prettyKey(k)}>{show(v)}</Field>
              ))}
            </Section>
          )}

          {(linked.length > 0 || related.length > 0) && (
            <div className="pt-3 border-t border-line space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Proposal / change details</p>
              {linked.map((p) => <ProposalCard key={p._id} p={p} />)}
              {related.length > 0 && (
                <>
                  <p className="text-xs text-ink-muted pt-1">Other proposals for this contact / Gram Panchayat</p>
                  {related.map((p) => <ProposalCard key={p._id} p={p} />)}
                </>
              )}
              {[...linked, ...related].some((p) => p.status === "pending") && (
                <Link to="/admin/approvals" className="btn btn-outline text-sm py-1.5 inline-flex">Review pending proposals in Approvals</Link>
              )}
            </div>
          )}

          {data.history?.length > 0 && (
            <div className="pt-3 border-t border-line">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">History / audit</p>
              <ul className="divide-y divide-line">
                {data.history.map((h) => (
                  <li key={h._id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <History className="h-3.5 w-3.5 text-ink-muted" />
                      <span className="font-medium text-ink">{h.entityType === "GramPanchayat" ? "Gram Panchayat" : "Contact"}: {FIELD_LABELS[h.field] || h.field}</span>
                      <span className="text-xs text-ink-muted ml-auto">{formatDateTime(h.createdAt)}</span>
                    </div>
                    <p className="text-ink-soft">
                      <span className="line-through text-ink-muted">{show(h.oldValue) || "—"}</span>{" → "}<span className="font-medium">{show(h.newValue) || "—"}</span>
                    </p>
                    <p className="text-xs text-ink-muted">{h.changedBy?.name ? `by ${h.changedBy.name} · ` : ""}{h.source?.replace(/_/g, " ")}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ProposalCard({ p }) {
  const prev = p.previousValues ? Object.entries(p.previousValues).filter(([k, v]) => !HIDDEN_KEYS.has(k) && show(v)) : [];
  const next = Object.entries(p.proposedChanges || {}).filter(([k, v]) => !HIDDEN_KEYS.has(k) && show(v));
  const type =
    p.action === "change_workplace" ? "Workplace change"
      : p.action === "replace_contact" ? "Contact replacement"
        : p.entityType === "General" ? "General suggestion"
          : p.entityType === "GramPanchayat" ? (p.isNewEntity ? "New Gram Panchayat" : "Gram Panchayat update")
            : p.isNewEntity ? "New contact" : "Contact update";

  return (
    <div className="rounded-lg border border-line p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{type}</span>
        <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
        <span className="text-xs text-ink-muted ml-auto">{formatDateTime(p.createdAt)}</span>
      </div>
      <p className="text-xs text-ink-muted">
        Proposed by {p.proposedBy?.name || "—"}
        {p.gramPanchayatId?.name ? ` · ${p.action === "change_workplace" ? "Proposed Gram Panchayat" : "Gram Panchayat"}: ${p.gramPanchayatId.name}` : ""}
      </p>
      {p.reason && <p className="text-ink-soft">Reason: {p.reason}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {prev.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-muted mb-1">Previous</p>
            <dl className="space-y-0.5">{prev.map(([k, v]) => <div key={k}><dt className="inline text-xs text-ink-muted">{FIELD_LABELS[k] || prettyKey(k)}: </dt><dd className="inline break-words">{show(v)}</dd></div>)}</dl>
          </div>
        )}
        <div className={prev.length ? "" : "sm:col-span-2"}>
          <p className="text-xs font-semibold text-ink-muted mb-1">{p.isNewEntity ? "Proposed" : "New"}</p>
          <dl className="space-y-0.5">{next.map(([k, v]) => <div key={k}><dt className="inline text-xs text-ink-muted">{FIELD_LABELS[k] || prettyKey(k)}: </dt><dd className="inline break-words">{show(v)}</dd></div>)}</dl>
        </div>
      </div>
      {p.status !== "pending" && (
        <p className="text-xs text-ink-muted">
          {p.status === "approved" ? "Approved" : "Rejected"} by {p.reviewedBy?.name || "—"}{p.reviewedAt ? ` · ${formatDateTime(p.reviewedAt)}` : ""}
          {p.reviewNote ? ` · Note: ${p.reviewNote}` : ""}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, cols = 2 }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">{title}</p>
      <dl className={`grid grid-cols-1 ${cols === 2 ? "sm:grid-cols-2" : ""} gap-x-4 gap-y-2 text-sm`}>{children}</dl>
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink font-medium break-words">{children}</dd>
    </div>
  );
}
