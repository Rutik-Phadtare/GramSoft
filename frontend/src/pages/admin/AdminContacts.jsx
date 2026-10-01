import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, SlidersHorizontal, Download } from "lucide-react";
import { personApi } from "../../api/persons";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGeoOptions } from "../../hooks/useGeoOptions";
import { useLatestRequest } from "../../hooks/useLatestRequest";
import { displayName, workplaceLine } from "../../utils/i18nData";
import { DESIGNATIONS, designationTranslationKey } from "../../utils/constants";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import Badge, { designationTone, softwareStatusTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { softwareStatusLabel } from "../../utils/format";

const emptyForm = { name: "", nameMr: "", designation: "Talathi", designationMr: "", phone: "", email: "", address: "", addressMr: "", district: "" };
const PAGE_SIZE = 25;

export default function AdminContacts() {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [designation, setDesignation] = useState("");
  const [district, setDistrict] = useState("");
  const [taluka, setTaluka] = useState("");
  const [softwareUsageStatus, setSoftwareUsageStatus] = useState("");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const runLatest = useLatestRequest();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  // Same bilingual district/taluka options as the Grampanchayat directory. A
  // contact has no taluka of its own - it's where their current GP is.
  const { districts: personDistricts, talukas } = useGeoOptions(district);

  const SOFTWARE_STATUS_OPTIONS = [
    { value: "", label: t("anySoftwareStatus") }, { value: "active", label: t("postedAtActiveGp") },
    { value: "churned", label: t("postedAtChurnedGp") }, { value: "never_used", label: t("postedAtNeverUsedGp") },
  ];
  const SORT_OPTIONS = [
    { value: "", label: t("sortRecentlyContacted") }, { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") }, { value: "name_asc", label: t("sortNameAsc") }, { value: "name_desc", label: t("sortNameDesc") },
  ];

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }
  const handleQueryChange = updateFilter(setQuery);
  const handleDesignationChange = updateFilter(setDesignation);
  const handleDistrictChange = (value) => { setDistrict(value); setTaluka(""); setPage(1); };
  const handleTalukaChange = updateFilter(setTaluka);
  const handleSoftwareStatusChange = updateFilter(setSoftwareUsageStatus);
  const handleSortChange = updateFilter(setSort);

  function refresh() {
    setLoading(true);
    runLatest((signal) =>
      personApi.list(
        { q: debouncedQuery || undefined, withHistory: true, designation: designation || undefined, district: district || undefined, taluka: taluka || undefined, softwareUsageStatus: softwareUsageStatus || undefined, sort: sort || undefined, page, limit: PAGE_SIZE },
        { signal }
      )
    )
      .then((data) => {
        if (!data) return; // superseded by a newer request
        setResults(data.results);
        setPagination(data.pagination);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(refresh, [debouncedQuery, designation, district, taluka, softwareUsageStatus, sort, page]);
  useSocketEvent("person:new", refresh);
  useSocketEvent("person:updated", refresh);
  useSocketEvent("person:transferred", refresh);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!form.name && !form.nameMr) {
      setError("Name is required (English or Marathi).");
      return;
    }
    setSubmitting(true);
    try {
      await personApi.create(form);
      setModalOpen(false);
      setForm(emptyForm);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await personApi.downloadCsv({ q: debouncedQuery, designation, district });
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = query || designation || district || taluka || softwareUsageStatus || sort;
  function clearFilters() {
    setQuery(""); setDesignation(""); setDistrict(""); setTaluka(""); setSoftwareUsageStatus(""); setSort(""); setPage(1);
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("directory")}
        title={t("contactsTitle")}
        description={t("contactsDesc")}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} disabled={exporting} className="btn btn-outline">
              <Download className="h-4 w-4" /> {exporting ? t("exporting") : t("exportCsv")}
            </button>
            <button onClick={() => setModalOpen(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" /> {t("addContact")}
            </button>
          </div>
        }
      />

      <div className="card p-4 mb-4 space-y-3">
        <SearchInput value={query} onChange={handleQueryChange} placeholder={t("search")} />
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
          <select className="field-input w-auto text-sm py-1.5" value={designation} onChange={(e) => handleDesignationChange(e.target.value)}>
            <option value="">{t("allDesignations")}</option>
            {DESIGNATIONS.map((d) => <option key={d} value={d}>{t(designationTranslationKey(d))}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={softwareUsageStatus} onChange={(e) => handleSoftwareStatusChange(e.target.value)}>
            {SOFTWARE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={district} onChange={(e) => handleDistrictChange(e.target.value)}>
            <option value="">{t("allDistricts")}</option>
            {personDistricts.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={taluka} onChange={(e) => handleTalukaChange(e.target.value)}>
            <option value="">{t("allTalukas")}</option>
            {talukas.map((tk) => <option key={tk.value} value={tk.value}>{tk.label}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={sort} onChange={(e) => handleSortChange(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {hasFilters && <button onClick={clearFilters} className="btn btn-ghost text-sm py-1.5">{t("clear")}</button>}
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={6} /></div>
        ) : results.length === 0 ? (
          <EmptyState title={t("noContactsFound")} hint={t("addOneOrImport")} />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((p) => {
              const currentGp = p.currentPostings?.[0]?.gramPanchayatId;
              const { primary, secondary } = displayName(p, language);
              return (
                <li key={p._id}>
                  <Link to={`/admin/contacts/${p._id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-canvas/60 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{primary}{secondary ? <span className="text-ink-muted font-normal"> · {secondary}</span> : null}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {p.phone || t("noPhone")} · {currentGp ? workplaceLine(currentGp, language) : t("noCurrentPosting")}
                        {p.totalGramPanchayatsHandled > 1 ? ` · ${p.totalGramPanchayatsHandled} GPs` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {currentGp?.softwareUsageStatus && (
                        <Badge tone={softwareStatusTone(currentGp.softwareUsageStatus)}>{softwareStatusLabel(currentGp.softwareUsageStatus)}</Badge>
                      )}
                      <Badge tone={designationTone(p.designation)}>{t(designationTranslationKey(p.designation))}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("addContact")}>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label">{t("name")} (English)</label><input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="field-label">{t("nameMarathi")}</label><input className="field-input" value={form.nameMr} onChange={(e) => setForm((f) => ({ ...f, nameMr: e.target.value }))} /></div>
          </div>
          <div>
            <label className="field-label">{t("designation")}</label>
            <select className="field-input" value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}>
              {DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div><label className="field-label">{t("designationMarathi")}</label><input className="field-input" value={form.designationMr} onChange={(e) => setForm((f) => ({ ...f, designationMr: e.target.value }))} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label">{t("phone")}</label><input className="field-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="field-label">{t("district")}</label><input className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} /></div>
          </div>
          <div><label className="field-label">{t("email")}</label><input type="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="field-label">{t("address")}</label><input className="field-input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
          <div><label className="field-label">{t("addressMarathi")}</label><input className="field-input" value={form.addressMr} onChange={(e) => setForm((f) => ({ ...f, addressMr: e.target.value }))} /></div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? t("saving") : t("save")}</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
