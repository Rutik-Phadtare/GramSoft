import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, SlidersHorizontal, Download } from "lucide-react";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useGeoOptions, invalidateGeoOptions } from "../../hooks/useGeoOptions";
import { useLatestRequest } from "../../hooks/useLatestRequest";
import { displayName, placeLine } from "../../utils/i18nData";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import Badge, { softwareStatusTone } from "../../components/Badge";
import ContactsEditor from "../../components/ContactsEditor";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate, softwareStatusLabel, paymentModeLabel } from "../../utils/format";

const PAYMENT_MODES = ["cash", "upi", "bank_transfer", "cheque", "other"];
const PAGE_SIZE = 25;

const emptyForm = {
  name: "", nameMr: "", taluka: "", talukaMr: "", district: "", districtMr: "", pincode: "", mukamPost: "",
  officePhone: "", officeEmail: "", gpType: "", waterSupplyMode: "",
  population: "", numberOfHouseholds: "", isUsingOurSoftware: false,
  softwareStartDate: "", subscriptionEndDate: "", subscriptionYears: "", priceAmount: "", paymentMode: "", previousSoftwareUsed: "",
};

export default function AdminGramPanchayats() {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
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
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  // `district` / `taluka` hold language-independent keys, so a selection
  // survives switching English <-> Marathi (only the labels change).
  const { districts, talukas } = useGeoOptions(district);

  const SOFTWARE_STATUS_OPTIONS = [
    { value: "", label: t("anySoftwareStatus") }, { value: "active", label: t("activeUsers") },
    { value: "churned", label: t("previouslyUsedNotNow") }, { value: "never_used", label: t("neverUsedSoftware") },
  ];
  const SORT_OPTIONS = [
    { value: "", label: t("sortRecentlyContacted") }, { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") }, { value: "name_asc", label: t("sortNameAsc") }, { value: "name_desc", label: t("sortNameDesc") },
    { value: "population_desc", label: t("sortPopulationDesc") }, { value: "population_asc", label: t("sortPopulationAsc") },
  ];

  function updateFilter(setter) {
    return (value) => { setter(value); setPage(1); };
  }
  const handleQueryChange = updateFilter(setQuery);
  const handleDistrictChange = (value) => { setDistrict(value); setTaluka(""); setPage(1); };
  const handleTalukaChange = updateFilter(setTaluka);
  const handleSoftwareStatusChange = updateFilter(setSoftwareUsageStatus);
  const handleSortChange = updateFilter(setSort);

  function refresh() {
    setLoading(true);
    runLatest((signal) =>
      gramPanchayatApi.list(
        { q: debouncedQuery || undefined, taluka: taluka || undefined, district: district || undefined, softwareUsageStatus: softwareUsageStatus || undefined, sort: sort || undefined, page, limit: PAGE_SIZE },
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

  useEffect(refresh, [debouncedQuery, taluka, district, softwareUsageStatus, sort, page]);
  useSocketEvent("gramPanchayat:new", () => { invalidateGeoOptions(); refresh(); });
  useSocketEvent("gramPanchayat:updated", () => { invalidateGeoOptions(); refresh(); });

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if ((!form.name && !form.nameMr) || (!form.taluka && !form.talukaMr) || (!form.district && !form.districtMr)) {
      setError("Name, taluka, and district are required (English or Marathi).");
      return;
    }
    if (submitting) return;
    if (contacts.some((c) => !(c.name || "").trim() && !(c.nameMr || "").trim())) {
      setError("Every contact needs a name, or remove it.");
      return;
    }
    setSubmitting(true);
    try {
      await gramPanchayatApi.create({
        ...form,
        ...(contacts.length ? { contacts } : {}),
        population: form.population ? Number(form.population) : undefined,
        numberOfHouseholds: form.numberOfHouseholds ? Number(form.numberOfHouseholds) : undefined,
        subscriptionYears: form.subscriptionYears ? Number(form.subscriptionYears) : undefined,
        priceAmount: form.priceAmount ? Number(form.priceAmount) : undefined,
      });
      setModalOpen(false);
      setForm(emptyForm);
      setContacts([]);
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
      await gramPanchayatApi.downloadCsv({ q: debouncedQuery, taluka, district, softwareUsageStatus });
    } finally {
      setExporting(false);
    }
  }

  const hasFilters = query || taluka || district || softwareUsageStatus || sort;
  function clearFilters() {
    setQuery(""); setTaluka(""); setDistrict(""); setSoftwareUsageStatus(""); setSort(""); setPage(1);
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("directory")}
        title={t("grampanchayatsTitle")}
        description={t("grampanchayatsDesc")}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} disabled={exporting} className="btn btn-outline">
              <Download className="h-4 w-4" /> {exporting ? t("exporting") : t("exportCsv")}
            </button>
            <button onClick={() => setModalOpen(true)} className="btn btn-primary">
              <Plus className="h-4 w-4" /> {t("addGrampanchayat")}
            </button>
          </div>
        }
      />

      <div className="card p-4 mb-4 space-y-3">
        <SearchInput value={query} onChange={handleQueryChange} placeholder={t("search")} />
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
          <select className="field-input w-auto text-sm py-1.5" value={softwareUsageStatus} onChange={(e) => handleSoftwareStatusChange(e.target.value)}>
            {SOFTWARE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="field-input w-auto text-sm py-1.5" value={district} onChange={(e) => handleDistrictChange(e.target.value)}>
            <option value="">{t("allDistricts")}</option>
            {districts.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
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
          <EmptyState title={t("noGrampanchayatsFound")} hint={t("addOneOrImport")} />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((gp) => {
              const { primary, secondary } = displayName(gp, language);
              return (
              <li key={gp._id}>
                <Link to={`/admin/grampanchayats/${gp._id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-canvas/60 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{primary}{secondary ? <span className="text-ink-muted font-normal"> · {secondary}</span> : null}</p>
                    <p className="text-xs text-ink-muted truncate">{placeLine(gp, language)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge tone={softwareStatusTone(gp.softwareUsageStatus)}>{softwareStatusLabel(gp.softwareUsageStatus)}</Badge>
                    {gp.lastContactedAt && (
                      <span className="text-xs text-ink-muted hidden sm:inline">{t("lastContact")} {formatDate(gp.lastContactedAt)}</span>
                    )}
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("addGrampanchayat")} maxWidth="max-w-2xl">
        <form onSubmit={handleCreate} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("basicInfo")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="field-label">{t("name")} (English)</label><input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><label className="field-label">{t("nameMarathi")}</label><input className="field-input" value={form.nameMr} onChange={(e) => setForm((f) => ({ ...f, nameMr: e.target.value }))} /></div>
              <div><label className="field-label">{t("taluka")}</label><input className="field-input" value={form.taluka} onChange={(e) => setForm((f) => ({ ...f, taluka: e.target.value }))} /></div>
              <div><label className="field-label">{t("talukaMarathi")}</label><input className="field-input" value={form.talukaMr} onChange={(e) => setForm((f) => ({ ...f, talukaMr: e.target.value }))} /></div>
              <div><label className="field-label">{t("district")}</label><input className="field-input" value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} /></div>
              <div><label className="field-label">{t("districtMarathi")}</label><input className="field-input" value={form.districtMr} onChange={(e) => setForm((f) => ({ ...f, districtMr: e.target.value }))} /></div>
              <div><label className="field-label">{t("mukamPost")}</label><input className="field-input" value={form.mukamPost} onChange={(e) => setForm((f) => ({ ...f, mukamPost: e.target.value }))} /></div>
              <div><label className="field-label">{t("pincode")}</label><input className="field-input" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))} /></div>
              <div><label className="field-label">{t("officePhone")}</label><input className="field-input" value={form.officePhone} onChange={(e) => setForm((f) => ({ ...f, officePhone: e.target.value }))} /></div>
              <div><label className="field-label">{t("officeEmail")}</label><input type="email" className="field-input" value={form.officeEmail} onChange={(e) => setForm((f) => ({ ...f, officeEmail: e.target.value }))} /></div>
              <div>
                <label className="field-label">{t("gpType")}</label>
                <select className="field-input" value={form.gpType} onChange={(e) => setForm((f) => ({ ...f, gpType: e.target.value }))}>
                  <option value="">—</option><option value="single">{t("single")}</option><option value="group">{t("group")}</option>
                </select>
              </div>
              <div>
                <label className="field-label">{t("waterSupply")}</label>
                <select className="field-input" value={form.waterSupplyMode} onChange={(e) => setForm((f) => ({ ...f, waterSupplyMode: e.target.value }))}>
                  <option value="">—</option><option value="combined">{t("combined")}</option><option value="separate">{t("separate")}</option>
                </select>
              </div>
              <div><label className="field-label">{t("population")}</label><input type="number" className="field-input" value={form.population} onChange={(e) => setForm((f) => ({ ...f, population: e.target.value }))} /></div>
              <div><label className="field-label">{t("households")}</label><input type="number" className="field-input" value={form.numberOfHouseholds} onChange={(e) => setForm((f) => ({ ...f, numberOfHouseholds: e.target.value }))} /></div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-line">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("softwareAndBilling")}</p>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-300" checked={form.isUsingOurSoftware} onChange={(e) => setForm((f) => ({ ...f, isUsingOurSoftware: e.target.checked }))} />
              {t("currentlyUsingSoftware")}
            </label>
            {form.isUsingOurSoftware ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="field-label">{t("startDate")}</label><input type="date" className="field-input" value={form.softwareStartDate} onChange={(e) => setForm((f) => ({ ...f, softwareStartDate: e.target.value }))} /></div>
                <div><label className="field-label">{t("renewalDeadline")}</label><input type="date" className="field-input" value={form.subscriptionEndDate} onChange={(e) => setForm((f) => ({ ...f, subscriptionEndDate: e.target.value }))} /></div>
                <div><label className="field-label">{t("yearsPurchased")}</label><input type="number" min="0" className="field-input" value={form.subscriptionYears} onChange={(e) => setForm((f) => ({ ...f, subscriptionYears: e.target.value }))} /></div>
                <div><label className="field-label">{t("price")} (₹)</label><input type="number" min="0" className="field-input" value={form.priceAmount} onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))} /></div>
                <div className="sm:col-span-2">
                  <label className="field-label">{t("paymentMode")}</label>
                  <select className="field-input" value={form.paymentMode} onChange={(e) => setForm((f) => ({ ...f, paymentMode: e.target.value }))}>
                    <option value="">{t("select")}</option>
                    {PAYMENT_MODES.map((m) => <option key={m} value={m}>{paymentModeLabel(m)}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div><label className="field-label">{t("whatUsingInstead")}</label><input className="field-input" value={form.previousSoftwareUsed} onChange={(e) => setForm((f) => ({ ...f, previousSoftwareUsed: e.target.value }))} /></div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink mb-2">Contacts <span className="text-xs font-normal text-ink-muted">(optional)</span></h3>
            <ContactsEditor value={contacts} onChange={setContacts} disabled={submitting} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? t("saving") : t("save")}</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
