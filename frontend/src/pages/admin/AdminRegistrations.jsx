import { useEffect, useState } from "react";
import { Share2, CheckCircle2, GitMerge, Copy, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { registrationApi } from "../../api/registrations";
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

const PAGE_SIZE = 15;
const publicFormUrl = `${window.location.origin}/register`;

const REGISTRATION_EDIT_FIELDS = [
  { key: "gramPanchayatName", label: "Grampanchayat name (English)" },
  { key: "gramPanchayatNameMr", label: "Grampanchayat name (Marathi)" },
  { key: "taluka", label: "Taluka" },
  { key: "district", label: "District" },
  { key: "mukamPost", label: "Mu. Po." },
  { key: "pincode", label: "Pincode" },
  { key: "officePhone", label: "Office phone" },
  { key: "officeEmail", label: "Office email" },
  { key: "sarpanchName", label: "Sarpanch name" },
  { key: "sarpanchPhone", label: "Sarpanch phone" },
  { key: "gramsevakName", label: "Gramsevak name" },
  { key: "gramsevakPhone", label: "Gramsevak phone" },
  { key: "computerOperatorName", label: "Computer Operator name" },
  { key: "computerOperatorPhone", label: "Computer Operator phone" },
];

export default function AdminRegistrations() {
  const { t } = useLanguage();
  const TABS = [
    { key: "new", label: t("new_") }, { key: "reviewed", label: t("reviewed") }, { key: "merged", label: t("merged") },
  ];
  const [status, setStatus] = useState("new");
  const [page, setPage] = useState(1);
  const [registrations, setRegistrations] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // full registration doc being edited
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [editCustomValues, setEditCustomValues] = useState({});

  useEffect(() => {
    formFieldApi.list("registration").then((d) => setCustomFieldDefs(d.fields)).catch(() => setCustomFieldDefs([]));
  }, []);

  function refresh() {
    setLoading(true);
    registrationApi.list({ status, page, limit: PAGE_SIZE }).then((data) => {
      setRegistrations(data.registrations);
      setPagination(data.pagination);
    }).finally(() => setLoading(false));
  }

  function changeTab(key) {
    setStatus(key);
    setPage(1);
  }

  useEffect(refresh, [status, page]);
  const { markSectionRead } = useNotifications();
  // Visiting this page is what clears its sidebar badge - no separate
  // "mark as read" click needed, and no popup window to open first.
  useEffect(() => { markSectionRead("registrations"); }, []);
  useSocketEvent("registration:new", refresh);
  useSocketEvent("registration:updated", refresh);
  useSocketEvent("registration:merged", refresh);

  async function markReviewed(id) {
    setBusyId(id);
    try {
      await registrationApi.updateStatus(id, "reviewed");
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function merge(id) {
    setBusyId(id);
    try {
      await registrationApi.merge(id);
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
    setEditForm(Object.fromEntries(REGISTRATION_EDIT_FIELDS.map(({ key }) => [key, r[key] || ""])));
    setEditCustomValues(r.customFields || {});
    setEditError("");
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError("");
    try {
      await registrationApi.updateDetails(editTarget._id, { ...editForm, customFields: editCustomValues });
      setEditTarget(null);
      refresh();
    } catch (err) {
      setEditError(apiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("registrations")}
        title={t("registrationsTitle")}
        description={t("registrationsDesc")}
        action={
          <button onClick={() => setShareOpen(true)} className="btn btn-outline">
            <Share2 className="h-4 w-4" /> {t("shareForm")}
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        {TABS.map((t2) => (
          <button key={t2.key} onClick={() => changeTab(t2.key)} className={`btn text-sm border ${status === t2.key ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}>
            {t2.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={4} /></div>
        ) : registrations.length === 0 ? (
          <EmptyState title={`${t("noRequestsFound")} ${status} registrations`} hint="Share the registration form link to start collecting them." />
        ) : (
          <ul className="divide-y divide-line">
            {registrations.map((r) => {
              const expanded = expandedId === r._id;
              return (
                <li key={r._id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        {r.gramPanchayatName}{r.gramPanchayatNameMr ? ` · ${r.gramPanchayatNameMr}` : ""}
                      </p>
                      <p className="text-xs text-ink-muted">{r.taluka}, {r.district} · {formatDateTime(r.submittedAt)}</p>
                    </div>
                    <Badge tone={feedbackStatusTone(r.status)}>{r.status}</Badge>
                  </div>

                  <div className="grid gap-1 text-sm text-ink-soft sm:grid-cols-3 mb-2">
                    {r.sarpanchName && <p><span className="text-ink-muted">{t("designation_Sarpanch")}:</span> {r.sarpanchName}</p>}
                    {r.gramsevakName && <p><span className="text-ink-muted">{t("designation_Gramsevak")}:</span> {r.gramsevakName}</p>}
                    {r.computerOperatorName && <p><span className="text-ink-muted">{t("designation_ComputerOperator")}:</span> {r.computerOperatorName}</p>}
                  </div>

                  <button onClick={() => setExpandedId(expanded ? null : r._id)} className="text-xs font-medium text-brand-700 flex items-center gap-1 mb-2">
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expanded ? t("hideFullDetails") : t("viewFullDetails")}
                  </button>

                  {expanded && (
                    <div className="rounded-lg bg-canvas p-4 text-sm space-y-3 mb-2">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <p><span className="text-ink-muted">{t("mukamPost")}:</span> {r.mukamPost || "—"}</p>
                        <p><span className="text-ink-muted">{t("pincode")}:</span> {r.pincode || "—"}</p>
                        <p><span className="text-ink-muted">{t("gpType")}:</span> {r.gpType || "—"}</p>
                        <p><span className="text-ink-muted">{t("officePhone")}:</span> {r.officePhone || "—"}</p>
                        <p><span className="text-ink-muted">{t("officeEmail")}:</span> {r.officeEmail || "—"}</p>
                        <p><span className="text-ink-muted">{t("waterSupply")}:</span> {r.waterSupplyMode || "—"}</p>
                        <p><span className="text-ink-muted">{t("reassessmentYears")}:</span> {r.reassessmentYearFrom ? `${r.reassessmentYearFrom} – ${r.reassessmentYearTo}` : "—"}</p>
                      </div>
                      {["taxRates", "constructionRates", "landRates"].map((key) => (
                        (r[key] || []).some((row) => row.minRate || row.maxRate || row.panchayatRate || row.ratePerSqm) && (
                          <div key={key}>
                            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1">
                              {key === "taxRates" ? t("taxRates") : key === "constructionRates" ? t("constructionRates") : t("landRates")}
                            </p>
                            <div className="space-y-0.5">
                              {r[key].filter((row) => row.minRate || row.maxRate || row.panchayatRate || row.ratePerSqm).map((row, i) => (
                                <p key={i} className="text-xs text-ink-soft">
                                  {row.labelEn} — {row.ratePerSqm ?? `min ${row.minRate ?? "—"} / max ${row.maxRate ?? "—"} / panchayat ${row.panchayatRate ?? "—"}`}
                                </p>
                              ))}
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {r.status !== "merged" && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.status === "new" && (
                        <button onClick={() => markReviewed(r._id)} disabled={busyId === r._id} className="btn btn-outline text-sm py-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {t("markReviewed")}
                        </button>
                      )}
                      <button onClick={() => openEdit(r)} className="btn btn-outline text-sm py-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => merge(r._id)} disabled={busyId === r._id} className="btn btn-primary text-sm py-1.5">
                        <GitMerge className="h-3.5 w-3.5" /> {t("mergeIntoDirectory")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit registration" maxWidth="max-w-lg">
        {editTarget && (
          <div>
            {editError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{editError}</div>}
            <p className="text-xs text-ink-muted mb-4">
              Correct anything from this submission before merging it into the directory — nothing here has been applied to a real record yet.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 max-h-[55vh] overflow-y-auto pr-1">
              {REGISTRATION_EDIT_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input
                    className="field-input"
                    value={editForm[key] || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
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
            alt="QR code linking to the public registration form"
            className="rounded-lg border border-line"
            width={220}
            height={220}
          />
          <div className="flex items-center gap-2 w-full">
            <input readOnly className="field-input text-xs" value={publicFormUrl} />
            <button onClick={copyLink} className="btn btn-outline flex-shrink-0"><Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="text-xs text-ink-muted text-center">
            Send this to a new Grampanchayat to collect their office details, admin contacts, and tax rates — no login needed on their end.
          </p>
        </div>
      </Modal>
    </div>
  );
}
