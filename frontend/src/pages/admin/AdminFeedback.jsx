import { useEffect, useState } from "react";
import { Share2, CheckCircle2, GitMerge, Copy, Pencil, Eye, Download } from "lucide-react";
import { feedbackApi } from "../../api/feedback";
import { formFieldApi } from "../../api/formFields";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useNotifications } from "../../context/NotificationContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge, { feedbackStatusTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import DynamicFields from "../../components/DynamicFields";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDateTime } from "../../utils/format";

const PAGE_SIZE = 20;
const publicFormUrl = `${window.location.origin}/feedback`;

const FEEDBACK_EDIT_FIELDS = [
  { key: "gramPanchayatName", label: "Grampanchayat name" },
  { key: "taluka", label: "Taluka" },
  { key: "district", label: "District" },
  { key: "respondentName", label: "Respondent name" },
  { key: "respondentDesignation", label: "Respondent designation" },
  { key: "respondentPhone", label: "Respondent phone" },
  { key: "respondentEmail", label: "Respondent email" },
  { key: "previousSoftwareUsed", label: "Previous software used" },
  { key: "improvementSuggestions", label: "Improvement suggestions" },
  { key: "additionalInfo", label: "Additional info" },
];

export default function AdminFeedback() {
  const { t } = useLanguage();
  const TABS = [
    { key: "new", label: t("new_") }, { key: "reviewed", label: t("reviewed") }, { key: "merged", label: t("merged") },
  ];
  const [status, setStatus] = useState("new");
  const [page, setPage] = useState(1);
  const [responses, setResponses] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [editCustomValues, setEditCustomValues] = useState({});

  useEffect(() => {
    formFieldApi.list("feedback").then((d) => setCustomFieldDefs(d.fields)).catch(() => setCustomFieldDefs([]));
  }, []);
  const [editError, setEditError] = useState("");

  function refresh() {
    setLoading(true);
    feedbackApi.list(status, page, PAGE_SIZE).then((data) => {
      setResponses(data.responses);
      setPagination(data.pagination);
    }).finally(() => setLoading(false));
  }

  function changeTab(key) {
    setStatus(key);
    setPage(1);
  }

  useEffect(refresh, [status, page]);
  const { markSectionRead } = useNotifications();
  useEffect(() => { markSectionRead("feedback"); }, []);
  useSocketEvent("feedback:new", refresh);
  useSocketEvent("feedback:updated", refresh);
  useSocketEvent("feedback:merged", refresh);

  async function markReviewed(id) {
    setBusyId(id);
    try {
      await feedbackApi.updateStatus(id, "reviewed");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function merge(id) {
    setBusyId(id);
    try {
      await feedbackApi.merge(id);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(publicFormUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openEdit(r) {
    setEditTarget(r);
    setEditForm(Object.fromEntries(FEEDBACK_EDIT_FIELDS.map(({ key }) => [key, r[key] || ""])));
    setEditCustomValues(r.customFields || {});
    setEditError("");
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError("");
    try {
      await feedbackApi.updateDetails(editTarget._id, { ...editForm, customFields: editCustomValues });
      setEditTarget(null);
      refresh();
    } catch (err) {
      setEditError(apiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function downloadReport() {
    setExporting(true);
    try {
      // Exports whatever tab is currently open (New/Reviewed/Merged), same
      // filter the admin is already looking at.
      await feedbackApi.downloadCsv(status);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("feedbackInbox")}
        title={t("feedbackInboxTitle")}
        description={t("feedbackInboxDesc")}
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadReport} disabled={exporting} className="btn btn-outline">
              <Download className="h-4 w-4" /> {exporting ? "Preparing…" : "Download report"}
            </button>
            <button onClick={() => setShareOpen(true)} className="btn btn-outline">
              <Share2 className="h-4 w-4" /> {t("shareForm")}
            </button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        {TABS.map((t2) => (
          <button
            key={t2.key}
            onClick={() => changeTab(t2.key)}
            className={`btn text-sm border ${status === t2.key ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}
          >
            {t2.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={4} /></div>
        ) : responses.length === 0 ? (
          <EmptyState title={`${t("noRequestsFound")} ${status} responses`} hint="Share the public form link to start collecting responses." />
        ) : (
          <ul className="divide-y divide-line">
            {responses.map((r) => (
              <li key={r._id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{r.gramPanchayatName}</p>
                    <p className="text-xs text-ink-muted">{r.taluka}, {r.district} · {formatDateTime(r.submittedAt)}</p>
                  </div>
                  <Badge tone={feedbackStatusTone(r.status)}>{r.status}</Badge>
                </div>
                <p className="text-sm text-ink-soft mb-1">
                  <span className="font-medium">{r.respondentName}</span> ({r.respondentDesignation}) · {r.respondentPhone || "no phone"}
                </p>
                <p className="text-sm text-ink-soft mb-1">
                  {t("usingOurSoftware")}: <span className="font-medium">{r.isUsingOurSoftware ? t("yes") : t("no")}</span>
                  {!r.isUsingOurSoftware && r.previousSoftwareUsed ? ` (currently: ${r.previousSoftwareUsed})` : ""}
                </p>
                {r.improvementSuggestions && (
                  <p className="text-sm text-ink-muted italic mb-2">"{r.improvementSuggestions}"</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => setDetailTarget(r)} className="btn btn-outline text-sm py-1.5">
                    <Eye className="h-3.5 w-3.5" /> View details
                  </button>
                  {r.status !== "merged" && r.status === "new" && (
                    <button onClick={() => markReviewed(r._id)} disabled={busyId === r._id} className="btn btn-outline text-sm py-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {t("markReviewed")}
                    </button>
                  )}
                  {r.status !== "merged" && (
                    <button onClick={() => openEdit(r)} className="btn btn-outline text-sm py-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                  {r.status !== "merged" && (
                    <button onClick={() => merge(r._id)} disabled={busyId === r._id} className="btn btn-primary text-sm py-1.5">
                      <GitMerge className="h-3.5 w-3.5" /> {t("mergeIntoDirectory")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={Boolean(detailTarget)} onClose={() => setDetailTarget(null)} title="Feedback submission" maxWidth="max-w-lg">
        {detailTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={feedbackStatusTone(detailTarget.status)}>{detailTarget.status}</Badge>
              <span className="text-xs text-ink-muted">Submitted {formatDateTime(detailTarget.submittedAt)}</span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Grampanchayat</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailField label="Name">{detailTarget.gramPanchayatName}</DetailField>
                <DetailField label="Taluka">{detailTarget.taluka || "—"}</DetailField>
                <DetailField label="District">{detailTarget.district || "—"}</DetailField>
                <DetailField label="Population">{detailTarget.population ?? "—"}</DetailField>
                <DetailField label="Households">{detailTarget.numberOfHouseholds ?? "—"}</DetailField>
              </dl>
            </div>

            <div className="pt-3 border-t border-line">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Software</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailField label="Using our software">{detailTarget.isUsingOurSoftware ? t("yes") : t("no")}</DetailField>
                {!detailTarget.isUsingOurSoftware && <DetailField label="Previously used">{detailTarget.previousSoftwareUsed || "—"}</DetailField>}
                {detailTarget.softwareStartDate && <DetailField label="Since">{formatDateTime(detailTarget.softwareStartDate)}</DetailField>}
              </dl>
              {detailTarget.likedFeatures && (
                <div className="mt-2">
                  <p className="text-xs text-ink-muted mb-1">What they like</p>
                  <p className="text-sm text-ink-soft whitespace-pre-wrap break-words bg-canvas rounded-lg p-3">{detailTarget.likedFeatures}</p>
                </div>
              )}
              {detailTarget.improvementSuggestions && (
                <div className="mt-2">
                  <p className="text-xs text-ink-muted mb-1">Improvement suggestions</p>
                  <p className="text-sm text-ink-soft whitespace-pre-wrap break-words bg-canvas rounded-lg p-3">{detailTarget.improvementSuggestions}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-line">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Respondent</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DetailField label="Name">{detailTarget.respondentName}</DetailField>
                <DetailField label="Designation">{detailTarget.respondentDesignation}</DetailField>
                <DetailField label="Phone">{detailTarget.respondentPhone || "—"}</DetailField>
                <DetailField label="Email">{detailTarget.respondentEmail || "—"}</DetailField>
              </dl>
              {detailTarget.additionalInfo && (
                <div className="mt-2">
                  <p className="text-xs text-ink-muted mb-1">Additional info</p>
                  <p className="text-sm text-ink-soft whitespace-pre-wrap break-words bg-canvas rounded-lg p-3">{detailTarget.additionalInfo}</p>
                </div>
              )}
            </div>

            {detailTarget.customFields && Object.keys(detailTarget.customFields).length > 0 && (
              <div className="pt-3 border-t border-line">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Additional questions</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(detailTarget.customFields).map(([key, value]) => (
                    <DetailField key={key} label={key}>
                      {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                    </DetailField>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit feedback" maxWidth="max-w-lg">
        {editTarget && (
          <div>
            {editError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{editError}</div>}
            <p className="text-xs text-ink-muted mb-4">
              Correct anything from this submission before merging it into the directory.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 max-h-[55vh] overflow-y-auto pr-1">
              {FEEDBACK_EDIT_FIELDS.map(({ key, label }) => (
                <div key={key} className={key === "improvementSuggestions" || key === "additionalInfo" ? "sm:col-span-2" : ""}>
                  <label className="field-label">{label}</label>
                  {key === "improvementSuggestions" || key === "additionalInfo" ? (
                    <textarea
                      className="field-textarea"
                      rows={2}
                      value={editForm[key] || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="field-input"
                      value={editForm[key] || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            {customFieldDefs.length > 0 && (
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">Additional questions</p>
                <DynamicFields
                  fields={customFieldDefs}
                  values={editCustomValues}
                  onChange={(key, value) => setEditCustomValues((v) => ({ ...v, [key]: value }))}
                />
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <button onClick={saveEdit} disabled={editSaving} className="btn btn-primary">{editSaving ? t("saving") : "Save changes"}</button>
              <button onClick={() => setEditTarget(null)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={t("shareForm")} maxWidth="max-w-sm">
        <div className="flex flex-col items-center gap-4">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(publicFormUrl)}`}
            alt="QR code linking to the public feedback form"
            className="rounded-lg border border-line"
            width={220}
            height={220}
          />
          <div className="flex items-center gap-2 w-full">
            <input readOnly className="field-input text-xs" value={publicFormUrl} />
            <button onClick={copyLink} className="btn btn-outline flex-shrink-0">
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-ink-muted text-center">
            Print the QR code or share the link with Grampanchayats to collect responses without them needing a login.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function DetailField({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink font-medium break-words">{children}</dd>
    </div>
  );
}
