import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Pencil, Landmark, ArrowRightLeft } from "lucide-react";
import { personApi } from "../../api/persons";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useLanguage } from "../../context/LanguageContext";
import { useGeoOptions } from "../../hooks/useGeoOptions";
import { useLatestRequest } from "../../hooks/useLatestRequest";
import { displayName, workplaceLine, nameLine, placeLine } from "../../utils/i18nData";
import { designationTranslationKey } from "../../utils/constants";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import Badge, { designationTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";

const PAGE_SIZE = 25;
const searchGps = (q) => gramPanchayatApi.list({ q }).then((d) => d.results);
const emptyForm = {
  name: "", nameMr: "", designation: "", phone: "", email: "",
  address: "", addressMr: "", district: "", notes: "",
};

export default function EmployeeContacts() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [taluka, setTaluka] = useState("");
  const [page, setPage] = useState(1);
  const runLatest = useLatestRequest();
  const { districts, talukas } = useGeoOptions(district);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const debouncedQuery = useDebouncedValue(query, 250);

  const [proposeTarget, setProposeTarget] = useState(null);
  const [proposeForm, setProposeForm] = useState(emptyForm);
  const [proposeError, setProposeError] = useState("");
  const [proposeSaving, setProposeSaving] = useState(false);
  const [proposed, setProposed] = useState(false);

  // Workplace (Grampanchayat) change proposal - sent to the same admin
  // approval queue as every other contact proposal.
  const [wpTarget, setWpTarget] = useState(null);
  const [wpFromId, setWpFromId] = useState("");
  const [wpTo, setWpTo] = useState(null);
  const [wpReason, setWpReason] = useState("");
  const [wpError, setWpError] = useState("");
  const [wpSaving, setWpSaving] = useState(false);
  const [wpDone, setWpDone] = useState(false);

  const canPropose = user?.role === "admin" || user?.permissions?.editContacts !== false;
  const canView = user?.role === "admin" || user?.permissions?.viewContacts !== false;

  function refresh() {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    runLatest((signal) =>
      personApi.list({ q: debouncedQuery || undefined, district: district || undefined, taluka: taluka || undefined, withHistory: true, page, limit: PAGE_SIZE }, { signal })
    )
      .then((data) => {
        if (!data) return;
        setResults(data.results);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }
  useEffect(refresh, [debouncedQuery, district, taluka, page, canView]);

  function openPropose(person) {
    setProposeTarget(person);
    setProposeForm({
      name: person.name || "",
      nameMr: person.nameMr || "",
      designation: person.designation || "",
      phone: person.phone || "",
      email: person.email || "",
      address: person.address || "",
      addressMr: person.addressMr || "",
      district: person.district || "",
      notes: person.notes || "",
    });
    setProposeError("");
    setProposed(false);
  }

  function openWorkplace(person) {
    const postings = person.currentPostings || [];
    setWpTarget(person);
    setWpFromId(postings.length === 1 ? postings[0].gramPanchayatId?._id || "" : "");
    setWpTo(null);
    setWpReason("");
    setWpError("");
    setWpDone(false);
  }

  async function submitWorkplace(e) {
    e.preventDefault();
    setWpError("");
    const postings = wpTarget.currentPostings || [];
    if (postings.length > 1 && !wpFromId) return setWpError("Choose which current workplace this change moves them from.");
    if (!wpTo) return setWpError("Choose the proposed Grampanchayat.");
    if (wpTo._id === wpFromId) return setWpError("The proposed Grampanchayat is the same as the current one.");
    setWpSaving(true);
    try {
      await changeRequestApi.create({
        entityType: "Person",
        action: "change_workplace",
        entityId: wpTarget._id,
        gramPanchayatId: wpTo._id,
        previousGramPanchayatId: wpFromId || undefined,
        reason: wpReason.trim() || "Employee proposed a workplace change",
      });
      setWpDone(true);
    } catch (err) {
      setWpError(apiErrorMessage(err));
    } finally {
      setWpSaving(false);
    }
  }

  async function submitPropose(e) {
    e.preventDefault();
    setProposeSaving(true);
    setProposeError("");
    try {
      const changes = {};
      for (const key of Object.keys(emptyForm)) {
        const current = proposeTarget[key] || "";
        if (proposeForm[key] !== current) changes[key] = proposeForm[key];
      }
      if (!Object.keys(changes).length) {
        setProposeError("Change something before submitting.");
        return;
      }
      await changeRequestApi.create({ entityType: "Person", entityId: proposeTarget._id, proposedChanges: changes });
      setProposed(true);
    } catch (err) {
      setProposeError(apiErrorMessage(err));
    } finally {
      setProposeSaving(false);
    }
  }

  if (!canView) {
    return <div><PageHeader eyebrow="Directory" title={t("contacts")} /><EmptyState title="You don't have access to this" hint="Ask an admin to turn on contact viewing for your account." /></div>;
  }

  return (
    <div>
      <PageHeader eyebrow="Directory" title={t("contacts")} description="Find people and see the Grampanchayat where they currently work." />

      <div className="card p-4 mb-4">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder={t("searchByNamePhone")} />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <select className="field-input w-auto text-sm py-1.5" value={district} onChange={(e) => { setDistrict(e.target.value); setTaluka(""); setPage(1); }}>
            <option value="">{t("allDistricts")}</option>
            {districts.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={taluka} onChange={(e) => { setTaluka(e.target.value); setPage(1); }}>
            <option value="">{t("allTalukas")}</option>
            {talukas.map((tk) => <option key={tk.value} value={tk.value}>{tk.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="p-5"><SkeletonRows rows={6} /></div> : results.length === 0 ? (
          <EmptyState title="No contacts found" hint="Try another name or phone number." />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((p) => {
              const currentGps = p.currentPostings || [];
              const { primary, secondary } = displayName(p, language);
              return (
                <li key={p._id}>
                  <div className="flex items-start justify-between gap-3 px-5 py-3.5">
                    <Link to={`/contacts`} className="min-w-0 flex-1 hover:bg-canvas/50 rounded-lg -m-2 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-ink truncate">{primary}{secondary ? <span className="text-ink-muted font-normal"> · {secondary}</span> : null}</p>
                        <Badge tone={designationTone(p.designation)}>{t(designationTranslationKey(p.designation))}</Badge>
                      </div>
                      <p className="text-xs text-ink-muted truncate">{p.phone || t("noPhone")}{p.email ? ` · ${p.email}` : ""}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {currentGps.length ? currentGps.map((a) => (
                          <span key={a._id} className="inline-flex items-center gap-1 text-xs text-ink-soft">
                            <Landmark className="h-3 w-3" /> {workplaceLine(a.gramPanchayatId, language)}
                          </span>
                        )) : <span className="text-xs text-ink-muted">{t("noCurrentWorkplace")}</span>}
                      </div>
                    </Link>
                    {canPropose && (
                      <div className="flex flex-col gap-1.5 sm:flex-row flex-shrink-0">
                        <button type="button" onClick={() => openPropose(p)} className="btn btn-outline text-xs py-1.5"><Pencil className="h-3.5 w-3.5" /> Propose change</button>
                        <button type="button" onClick={() => openWorkplace(p)} className="btn btn-outline text-xs py-1.5"><ArrowRightLeft className="h-3.5 w-3.5" /> Change workplace</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={Boolean(proposeTarget)} onClose={() => setProposeTarget(null)} title="Propose contact changes" maxWidth="max-w-2xl">
        {proposed ? (
          <div className="space-y-4"><p className="text-sm text-ink-soft">Your complete contact change proposal was sent to admin review. The live contact is unchanged until approval.</p><button type="button" onClick={() => setProposeTarget(null)} className="btn btn-primary">Done</button></div>
        ) : (
          <form onSubmit={submitPropose} className="space-y-4">
            {proposeError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{proposeError}</div>}
            <p className="text-xs text-ink-muted">You can propose any directory detail that is wrong, missing, or outdated.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["name", "Name (English)"], ["nameMr", "Name (Marathi)"], ["phone", "Phone"], ["email", "Email"],
                ["designation", "Designation"], ["district", "District"], ["address", "Address (English)"], ["addressMr", "Address (Marathi)"],
              ].map(([key, label]) => (
                <div key={key} className={key.startsWith("address") ? "sm:col-span-2" : ""}>
                  <label className="field-label">{label}</label>
                  <input className="field-input" value={proposeForm[key]} onChange={(e) => setProposeForm((f) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="sm:col-span-2"><label className="field-label">Notes</label><textarea className="field-textarea" rows={3} value={proposeForm.notes} onChange={(e) => setProposeForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="flex gap-3 pt-1"><button type="submit" disabled={proposeSaving} className="btn btn-primary">{proposeSaving ? t("saving") : "Submit for approval"}</button><button type="button" onClick={() => setProposeTarget(null)} className="btn btn-ghost">{t("cancel")}</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(wpTarget)} onClose={() => setWpTarget(null)} title="Propose workplace change" maxWidth="max-w-lg">
        {wpTarget && (wpDone ? (
          <div className="space-y-4"><p className="text-sm text-ink-soft">Your workplace change proposal was sent to admin review. {displayName(wpTarget, language).primary} stays at their current workplace until it is approved.</p><button type="button" onClick={() => setWpTarget(null)} className="btn btn-primary">Done</button></div>
        ) : (
          <form onSubmit={submitWorkplace} className="space-y-4">
            {wpError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{wpError}</div>}
            <p className="text-sm font-medium text-ink">{displayName(wpTarget, language).primary}</p>
            <div>
              <label className="field-label">Current workplace</label>
              {(wpTarget.currentPostings || []).length > 1 ? (
                <select className="field-input" value={wpFromId} onChange={(e) => setWpFromId(e.target.value)}>
                  <option value="">Select…</option>
                  {wpTarget.currentPostings.map((a) => <option key={a._id} value={a.gramPanchayatId?._id}>{workplaceLine(a.gramPanchayatId, language)}</option>)}
                </select>
              ) : (wpTarget.currentPostings || []).length === 1 ? (
                <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-soft">{workplaceLine(wpTarget.currentPostings[0].gramPanchayatId, language)}</p>
              ) : (
                <p className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2 text-sm text-ink-muted">{t("noCurrentWorkplace")}</p>
              )}
            </div>
            <EntitySearchSelect
              label="Proposed workplace *"
              placeholder={t("searchGpPlaceholder")}
              fetchResults={searchGps}
              value={wpTo}
              onChange={setWpTo}
              emptyHint="No matching Grampanchayat found."
              renderOption={(gp) => (<div><p className="text-sm font-medium text-ink">{nameLine(gp, language)}</p><p className="text-xs text-ink-muted">{placeLine(gp, language)}</p></div>)}
              renderSelected={(gp) => (<div><p className="text-sm font-medium text-ink">{nameLine(gp, language)}</p><p className="text-xs text-ink-muted">{placeLine(gp, language)}</p></div>)}
            />
            <div>
              <label className="field-label">Reason (optional)</label>
              <textarea className="field-textarea" rows={2} value={wpReason} onChange={(e) => setWpReason(e.target.value)} placeholder="e.g. He told me he was transferred last month" />
            </div>
            <div className="flex gap-3 pt-1"><button type="submit" disabled={wpSaving} className="btn btn-primary">{wpSaving ? t("saving") : "Submit for approval"}</button><button type="button" onClick={() => setWpTarget(null)} className="btn btn-ghost">{t("cancel")}</button></div>
          </form>
        ))}
      </Modal>
    </div>
  );
}
