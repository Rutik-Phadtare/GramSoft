import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, UserPlus, Pencil } from "lucide-react";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useNotifications } from "../../context/NotificationContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge, { designationTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDateTime } from "../../utils/format";
import { displayName, talukaLabel } from "../../utils/i18nData";

const PAGE_SIZE = 20;

const FIELD_LABEL_KEYS = {
  name: "name", nameMr: "nameMarathi", designation: "designation", phone: "phone",
  email: "email", address: "address", addressMr: "addressMarathi", district: "district", taluka: "taluka",
  mukamPost: "mukamPost", pincode: "pincode", officePhone: "officePhone", officeEmail: "officeEmail",
  gpType: "gpType", waterSupplyMode: "waterSupply", reassessmentYearFrom: "reassessmentYears",
  reassessmentYearTo: "reassessmentYears", taxRates: "taxRates", constructionRates: "constructionRates",
  landRates: "landRates", customFields: "customFields",
  category: "category", targetArea: "affectedArea", title: "changeTitle", details: "details", requestedOutcome: "expectedOutcome", urgency: "priority", page: "page", referenceId: "reference", metadata: "metadata",
};

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function prepareEditPayload(form, original) {
  const next = { ...form };
  for (const field of Object.keys(next)) {
    const originalValue = original?.[field];
    if (Array.isArray(originalValue) || (originalValue && typeof originalValue === "object")) {
      try { next[field] = JSON.parse(next[field]); }
      catch { throw new Error(`Invalid JSON in ${field}`); }
    }
  }
  return next;
}

export default function AdminApprovals() {
  const { t, language } = useLanguage();
  const TABS = [
    { key: "pending", label: t("pending") }, { key: "approved", label: t("approved") }, { key: "rejected", label: t("rejected") },
  ];
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editTarget, setEditTarget] = useState(null); // change request being edited
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  function refresh() {
    setLoading(true);
    changeRequestApi.list({ status, page, limit: PAGE_SIZE }).then((data) => {
      setRequests(data.changeRequests);
      setPagination(data.pagination);
    }).finally(() => setLoading(false));
  }

  useEffect(refresh, [status, page]);
  const { markSectionRead } = useNotifications();
  useEffect(() => { markSectionRead("approvals"); }, []);
  useSocketEvent("changeRequest:new", refresh);
  useSocketEvent("changeRequest:updated", refresh);

  function changeTab(key) {
    setStatus(key);
    setPage(1);
  }

  async function approve(id, edits) {
    setBusyId(id);
    try {
      await changeRequestApi.approve(id, edits);
      refresh();
    } catch (err) {
      const data = err?.response?.data;
      // The Grampanchayat this contact is being linked to already has
      // someone else in that single-holder role (Talathi/Sarpanch/etc.) -
      // approving as-is would create two current holders, so confirm with
      // the admin before moving the previous holder to past contacts.
      if (data?.error === "ALREADY_HAS_HOLDER" && window.confirm(data.message + " Continue?")) {
        try {
          await changeRequestApi.approve(id, edits, true);
          refresh();
        } catch (err2) {
          window.alert(apiErrorMessage(err2));
        }
      } else if (data?.error !== "ALREADY_HAS_HOLDER") {
        window.alert(apiErrorMessage(err));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id) {
    const reviewNote = window.prompt("Optional note on why this is being rejected:") || undefined;
    setBusyId(id);
    try {
      await changeRequestApi.reject(id, reviewNote);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(r) {
    setEditTarget(r);
    const next = {};
    for (const [key, value] of Object.entries(r.proposedChanges || {})) {
      next[key] = value && typeof value === "object" ? JSON.stringify(value, null, 2) : value ?? "";
    }
    setEditForm(next);
    setEditError("");
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError("");
    try {
      await changeRequestApi.update(editTarget._id, prepareEditPayload(editForm, editTarget.proposedChanges));
      setEditTarget(null);
      refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : apiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function saveEditAndApprove() {
    setEditSaving(true);
    setEditError("");
    try {
      await changeRequestApi.approve(editTarget._id, prepareEditPayload(editForm, editTarget.proposedChanges));
      setEditTarget(null);
      refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : apiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow={t("approvals")} title={t("approvalsTitle")} description={t("approvalsDesc")} />

      <div className="flex gap-2 mb-4">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => changeTab(tb.key)}
            className={`btn text-sm border ${status === tb.key ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={4} /></div>
        ) : requests.length === 0 ? (
          <EmptyState title={`${t("noRequestsFound")} ${status} requests`} hint="Contact and new Grampanchayat requests from the field activity form will show up here." />
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r._id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink flex items-center gap-2">
                      {r.isNewEntity ? <UserPlus className="h-3.5 w-3.5 text-brand-600" /> : null}
                      {r.entityType === "General" ? "General change suggestion" : (r.isNewEntity ? (r.entityType === "GramPanchayat" ? "New Grampanchayat" : t("newContactLabel")) : t("updateToExisting"))}
                      {r.proposedChanges.designation && <Badge tone={designationTone(r.proposedChanges.designation)}>{r.proposedChanges.designation}</Badge>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {t("proposedBy")} {r.proposedBy?.name || "unknown"} · {formatDateTime(r.createdAt)}
                      {r.entityType !== "General" && !r.isNewEntity && r.entityId && r.entityType === "Person" && (
                        <> · <Link to={`/admin/contacts/${r.entityId}`} className="underline hover:text-ink-soft">{t("viewCurrentRecord")}</Link></>
                      )}
                    </p>
                    {r.gramPanchayatId && r.entityType === "Person" && (
                      <p className="text-xs text-ink-muted mt-0.5">
                        Grampanchayat: <span className="font-medium text-ink-soft">{displayName(r.gramPanchayatId, language).primary}</span>
                        {talukaLabel(r.gramPanchayatId, language) && `, ${talukaLabel(r.gramPanchayatId, language)}`}
                      </p>
                    )}
                  </div>
                  {status === "pending" ? (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => approve(r._id)} disabled={busyId === r._id} className="btn btn-primary text-sm py-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t("approve")}
                      </button>
                      <button onClick={() => openEdit(r)} className="btn btn-outline text-sm py-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => reject(r._id)} disabled={busyId === r._id} className="btn btn-outline text-signal-600 border-signal-300 hover:bg-signal-50 text-sm py-1.5">
                        <XCircle className="h-3.5 w-3.5" /> {t("reject")}
                      </button>
                    </div>
                  ) : (
                    <Badge tone={status === "approved" ? "brand" : "signal"}>{status}</Badge>
                  )}
                </div>

                <div className="rounded-lg bg-canvas p-3 text-sm">
                  {Object.keys(r.proposedChanges).map((field) => (
                    <div key={field} className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-ink-muted w-32 flex-shrink-0">{t(FIELD_LABEL_KEYS[field]) || field}</span>
                      {!r.isNewEntity && (
                        <>
                          <span className="text-ink-muted line-through">{displayValue(r.previousValues?.[field])}</span>
                          <span className="text-ink-muted">→</span>
                        </>
                      )}
                      <span className="font-medium text-ink">{displayValue(r.proposedChanges[field])}</span>
                    </div>
                  ))}
                </div>
                {r.reason && <p className="text-xs text-ink-muted mt-2 italic">"{r.reason}"</p>}
                {r.reviewNote && <p className="text-xs text-signal-600 mt-2">Review note: {r.reviewNote}</p>}
              </li>
            ))}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit proposed changes" maxWidth="max-w-md">
        {editTarget && (
          <div>
            {editError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{editError}</div>}
            <p className="text-xs text-ink-muted mb-4">
              {editTarget.entityType === "General"
                ? `Refine what ${editTarget.proposedBy?.name || "the employee"} submitted before marking the suggestion accepted.`
                : `Correct what ${editTarget.proposedBy?.name || "the employee"} proposed before it is applied to the real record.`}
            </p>
            <div className="space-y-3">
              {Object.keys(editForm).map((field) => (
                <div key={field}>
                  <label className="field-label">{FIELD_LABEL_KEYS[field] ? t(FIELD_LABEL_KEYS[field]) : field}</label>
                  {typeof editTarget.proposedChanges[field] === "object" ? (
                    <textarea
                      className="field-input min-h-24 font-mono text-xs"
                      value={editForm[field] || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="field-input"
                      value={editForm[field] || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 pt-4">
              <button onClick={saveEditAndApprove} disabled={editSaving} className="btn btn-primary">
                {editSaving ? t("saving") : editTarget?.entityType === "General" ? "Save & accept" : "Save & approve"}
              </button>
              <button onClick={saveEdit} disabled={editSaving} className="btn btn-outline">
                {editSaving ? t("saving") : "Save only"}
              </button>
              <button onClick={() => setEditTarget(null)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
