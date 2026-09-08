import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2, Save, ArrowRightLeft, Clock, Landmark, History as HistoryIcon, Phone } from "lucide-react";
import { personApi } from "../../api/persons";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { DESIGNATIONS } from "../../utils/constants";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge, { designationTone, softwareStatusTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import ChangeHistoryList from "../../components/ChangeHistoryList";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate, formatDateTime, activityTypeLabel, softwareStatusLabel } from "../../utils/format";

export default function AdminContactDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferReplaceConfirm, setTransferReplaceConfirm] = useState(null);
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  function refresh() {
    personApi.get(id).then((d) => {
      setData(d);
      setForm({
        name: d.person.name, nameMr: d.person.nameMr || "", designation: d.person.designation,
        designationMr: d.person.designationMr || "",
        phone: d.person.phone || "", email: d.person.email || "",
        address: d.person.address || "", addressMr: d.person.addressMr || "",
        district: d.person.district || "", notes: d.person.notes || "",
      });
    }).finally(() => setLoading(false));
  }

  useEffect(refresh, [id]);
  useSocketEvent("activity:new", (entry) => {
    if (entry.personId?._id === id || entry.personId === id) refresh();
  });
  useSocketEvent("person:transferred", (payload) => {
    if (payload.personId === id) refresh();
  });

  const searchGramPanchayats = useCallback((q) => gramPanchayatApi.list({ q }).then((d) => d.results), []);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await personApi.update(id, form);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this contact? Their posting history will be removed. Activity history stays.")) return;
    await personApi.remove(id);
    navigate("/admin/contacts");
  }

  async function handleTransfer(confirmReplace = false) {
    if (!transferTarget) return;
    setTransferring(true);
    setTransferError("");
    try {
      await personApi.transfer(id, { newGramPanchayatId: transferTarget._id, confirmReplace: confirmReplace || undefined });
      setTransferOpen(false);
      setTransferTarget(null);
      setTransferReplaceConfirm(null);
      refresh();
    } catch (err) {
      if (err?.response?.status === 409 && err.response.data?.requiresConfirmation) {
        setTransferReplaceConfirm({ conflict: err.response.data.conflict, message: err.response.data.message });
      } else {
        setTransferError(apiErrorMessage(err));
      }
    } finally {
      setTransferring(false);
    }
  }

  function toggleHistory() {
    if (!showHistory && !history) {
      personApi.history(id).then((d) => setHistory(d.history));
    }
    setShowHistory((s) => !s);
  }

  if (loading || !data) {
    return <div className="max-w-3xl"><SkeletonRows rows={6} /></div>;
  }

  const lastActivity = data.lastActivity;
  const previousPhones = data.person.previousPhones || [];

  return (
    <div>
      <Link to="/admin/contacts" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-soft mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("backToContacts")}
      </Link>

      <PageHeader
        eyebrow={data.person.designationMr ? `${data.person.designation} · ${data.person.designationMr}` : data.person.designation}
        title={data.person.nameMr ? `${data.person.name} · ${data.person.nameMr}` : data.person.name}
        description={data.person.phone}
        action={
          <div className="flex gap-2">
            <button onClick={() => setTransferOpen(true)} className="btn btn-outline"><ArrowRightLeft className="h-4 w-4" /> {t("recordTransfer")}</button>
            <button onClick={handleDelete} className="btn btn-outline text-signal-600 border-signal-300 hover:bg-signal-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-6">
        <Badge tone="outline">{t("handledGps")} {data.totalGramPanchayatsHandled} Grampanchayat{data.totalGramPanchayatsHandled === 1 ? "" : "s"}</Badge>
        {data.currentPostings.length > 1 && <Badge tone="accent">{data.currentPostings.length} {t("concurrentPostings")}</Badge>}
        {previousPhones.length > 0 && <Badge tone="signal"><Phone className="h-3 w-3 mr-1 inline" />{previousPhones.length} {t("previousNumbers")}{previousPhones.length === 1 ? "" : "s"}</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {(data.person.address || data.person.addressMr) && (
            <div className="card p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("addressSection")}</h2>
              {data.person.address && <p className="text-sm text-ink-soft">{data.person.address}</p>}
              {data.person.addressMr && <p className="text-sm text-ink-soft">{data.person.addressMr}</p>}
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-ink-muted" /> {t("currentPosting")}{data.currentPostings.length !== 1 ? "s" : ""}
            </h2>
            {data.currentPostings.length === 0 ? (
              <EmptyState title={t("notCurrentlyPosted")} />
            ) : (
              <ul className="divide-y divide-line">
                {data.currentPostings.map((a) => (
                  <li key={a._id}>
                    <Link to={`/admin/grampanchayats/${a.gramPanchayatId?._id}`} className="flex items-center justify-between py-2.5 hover:bg-canvas/60 -mx-2 px-2 rounded-lg transition-colors">
                      <div>
                        <p className="text-sm font-medium text-ink">{a.gramPanchayatId?.name}</p>
                        <p className="text-xs text-ink-muted">{a.gramPanchayatId?.taluka}, {a.gramPanchayatId?.district} · {t("since")} {formatDate(a.fromDate)}</p>
                      </div>
                      {a.gramPanchayatId?.softwareUsageStatus && (
                        <Badge tone={softwareStatusTone(a.gramPanchayatId.softwareUsageStatus)}>{softwareStatusLabel(a.gramPanchayatId.softwareUsageStatus)}</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-muted" /> {t("lastActivity")}
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
            ) : <EmptyState title={t("noActivityWithContact")} />}
          </div>

          {data.activity.length > 1 && (
            <div className="card p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("activityHistory")}</h2>
              <ul className="divide-y divide-line">
                {data.activity.map((entry) => (
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
            </div>
          )}

          {previousPhones.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <Phone className="h-4 w-4 text-ink-muted" /> {t("previousPhoneNumbers")}
              </h2>
              <ul className="divide-y divide-line">
                {previousPhones.map((p, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-ink-soft">{p.number}</span>
                    <span className="text-xs text-ink-muted">{t("replaced")} {formatDate(p.replacedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-5">
            <button onClick={toggleHistory} className="flex items-center justify-between w-full">
              <h2 className="font-display text-sm font-semibold text-ink flex items-center gap-2">
                <HistoryIcon className="h-4 w-4 text-ink-muted" /> {t("changeHistory")}
              </h2>
              <span className="text-xs text-brand-700 font-medium">{showHistory ? t("hide") : t("show")}</span>
            </button>
            {showHistory && <div className="mt-3">{history ? <ChangeHistoryList history={history} /> : <SkeletonRows rows={2} />}</div>}
          </div>

          {data.pastPostings.length > 0 && (
            <div className="card p-5">
              <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("pastPostings")}</h2>
              <ul className="divide-y divide-line">
                {data.pastPostings.map((a) => (
                  <li key={a._id} className="flex items-center justify-between py-2.5">
                    <p className="text-sm text-ink-soft">{a.gramPanchayatId?.name}</p>
                    <span className="text-xs text-ink-muted">{formatDate(a.fromDate)} – {formatDate(a.toDate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form onSubmit={handleSave} className="card p-5 space-y-4 h-fit">
          <h2 className="font-display text-sm font-semibold text-ink">{t("editDetails")}</h2>
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
          <div><label className="field-label">{t("name")} (English)</label><input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="field-label">{t("nameMarathi")}</label><input className="field-input" value={form.nameMr} onChange={(e) => setForm((f) => ({ ...f, nameMr: e.target.value }))} /></div>
          <div>
            <label className="field-label">{t("designation")}</label>
            <select className="field-input" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}>
              {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t("designationMarathi")}</label><input className="field-input" value={form.designationMr} onChange={(e) => setForm((f) => ({ ...f, designationMr: e.target.value }))} /></div>
          <div><label className="field-label">{t("phone")}</label><input className="field-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="field-label">{t("email")}</label><input type="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="field-label">{t("address")} (English)</label><textarea className="field-textarea" rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
          <div><label className="field-label">{t("addressMarathi")}</label><textarea className="field-textarea" rows={2} value={form.addressMr} onChange={(e) => setForm((f) => ({ ...f, addressMr: e.target.value }))} /></div>
          <div><label className="field-label">{t("district")}</label><input className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} /></div>
          <div><label className="field-label">{t("notes")}</label><textarea className="field-textarea" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Anything worth remembering about this contact" /></div>
          <button type="submit" disabled={saving} className="btn btn-primary w-full">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Record a transfer">
        <p className="text-sm text-ink-muted mb-4">{t("transferHint")}</p>
        {transferError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{transferError}</div>}
        <EntitySearchSelect
          label={t("newGrampanchayat")}
          fetchResults={searchGramPanchayats}
          value={transferTarget}
          onChange={setTransferTarget}
          renderOption={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
          renderSelected={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
        />
        <div className="flex gap-3 pt-4">
          <button onClick={() => handleTransfer(false)} disabled={!transferTarget || transferring} className="btn btn-primary">{transferring ? t("saving") : t("confirmTransfer")}</button>
          <button onClick={() => setTransferOpen(false)} className="btn btn-ghost">Cancel</button>
        </div>
      </Modal>

      <Modal open={Boolean(transferReplaceConfirm)} onClose={() => setTransferReplaceConfirm(null)} title="Replace current holder?" maxWidth="max-w-sm">
        {transferReplaceConfirm && (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">{transferReplaceConfirm.message}</p>
            <div className="rounded-lg bg-canvas p-3 text-sm">
              <p className="flex items-center gap-2">
                <Badge tone={designationTone(transferReplaceConfirm.conflict.designation)}>{transferReplaceConfirm.conflict.designation}</Badge>
                <span className="font-medium text-ink">{transferReplaceConfirm.conflict.person?.name}</span>
              </p>
              {transferReplaceConfirm.conflict.person?.phone && (
                <p className="text-xs text-ink-muted mt-1">{transferReplaceConfirm.conflict.person.phone}</p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => handleTransfer(true)} disabled={transferring} className="btn btn-primary">
                {transferring ? t("saving") : "Confirm & replace"}
              </button>
              <button onClick={() => setTransferReplaceConfirm(null)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>

  );
}
