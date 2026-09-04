import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, SlidersHorizontal, Activity, Landmark, Users } from "lucide-react";
import { searchApi } from "../../api/search";
import { activityApi } from "../../api/activities";
import { activityTypeApi } from "../../api/activityTypes";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { personApi } from "../../api/persons";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { DESIGNATIONS } from "../../utils/constants";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import Badge, {
  designationTone,
  clientInterestTone,
  softwareStatusTone,
} from "../../components/Badge";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import {
  formatDate,
  formatDateTime,
  activityTypeLabel,
  softwareStatusLabel,
} from "../../utils/format";

const PAGE_SIZE = 25;

const TABS = [
  { key: "activity", labelKey: "tabActivity", icon: Activity },
  { key: "grampanchayats", labelKey: "tabGrampanchayats", icon: Landmark },
  { key: "contacts", labelKey: "tabContacts", icon: Users },
];

export default function AdminExplorer() {
  const { t } = useLanguage();
  const [tab, setTab] = useState("activity");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  const [activityFilters, setActivityFilters] = useState({
    type: "",
    designation: "",
    from: "",
    to: "",
    page: 1,
  });

  const [gpFilters, setGpFilters] = useState({
    taluka: "",
    district: "",
    softwareUsageStatus: "",
    sort: "",
    page: 1,
  });

  const [personFilters, setPersonFilters] = useState({
    designation: "",
    taluka: "",
    district: "",
    softwareUsageStatus: "",
    sort: "",
    page: 1,
  });

  const SOFTWARE_STATUS_OPTIONS = [
    { value: "", label: t("anySoftwareStatus") },
    { value: "active", label: t("activeUsers") },
    { value: "churned", label: t("previouslyUsedNotNow") },
    { value: "never_used", label: t("neverUsedSoftware") },
  ];

  const GP_SORT_OPTIONS = [
    { value: "", label: t("sortRecentlyContacted") },
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "name_asc", label: t("sortNameAsc") },
    { value: "population_desc", label: t("sortPopulationDesc") },
  ];

  const PERSON_SORT_OPTIONS = [
    { value: "", label: t("sortRecentlyContacted") },
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "name_asc", label: t("sortNameAsc") },
  ];

  const [types, setTypes] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [talukas, setTalukas] = useState([]);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  function switchTab(key) {
    setTab(key);
    setHasNew(false);
  }

  function handleQueryChange(value) {
    setQuery(value);
    setActivityFilters((f) => ({ ...f, page: 1 }));
    setGpFilters((f) => ({ ...f, page: 1 }));
    setPersonFilters((f) => ({ ...f, page: 1 }));
  }

  useEffect(() => {
    activityTypeApi.list().then((data) => setTypes(data.types));
    gramPanchayatApi.filterOptions().then((d) => setDistricts(d.districts));
  }, []);

  // Talukas are scoped to whichever district is currently selected on the
  // active tab (Grampanchayats or Contacts), so picking "Satara" as
  // district only ever offers Satara's own talukas next.
  const activeDistrict =
    tab === "grampanchayats"
      ? gpFilters.district
      : tab === "contacts"
        ? personFilters.district
        : "";

  useEffect(() => {
    gramPanchayatApi.filterOptions(activeDistrict).then((d) => {
      setTalukas(d.talukas);
    });
  }, [activeDistrict]);

  const activityParams = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      type: activityFilters.type || undefined,
      designation: activityFilters.designation || undefined,
      from: activityFilters.from || undefined,
      to: activityFilters.to || undefined,
      page: activityFilters.page,
      limit: PAGE_SIZE,
    }),
    [debouncedQuery, activityFilters]
  );

  const gpParams = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      taluka: gpFilters.taluka || undefined,
      district: gpFilters.district || undefined,
      softwareUsageStatus: gpFilters.softwareUsageStatus || undefined,
      sort: gpFilters.sort || undefined,
      page: gpFilters.page,
      limit: PAGE_SIZE,
    }),
    [debouncedQuery, gpFilters]
  );

  const personParams = useMemo(
    () => ({
      q: debouncedQuery || undefined,
      withHistory: true,
      designation: personFilters.designation || undefined,
      taluka: personFilters.taluka || undefined,
      district: personFilters.district || undefined,
      softwareUsageStatus: personFilters.softwareUsageStatus || undefined,
      sort: personFilters.sort || undefined,
      page: personFilters.page,
      limit: PAGE_SIZE,
    }),
    [debouncedQuery, personFilters]
  );

  function runSearch() {
    setLoading(true);
    setHasNew(false);

    const request =
      tab === "activity"
        ? searchApi.run(activityParams)
        : tab === "grampanchayats"
          ? gramPanchayatApi.list(gpParams)
          : personApi.list(personParams);

    request
      .then((data) => {
        setResults(tab === "activity" ? data.entries : data.results);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, activityParams, gpParams, personParams]);

  useSocketEvent(
    "activity:new",
    () => tab === "activity" && setHasNew(true)
  );

  useSocketEvent(
    "gramPanchayat:new",
    () => tab === "grampanchayats" && setHasNew(true)
  );

  useSocketEvent(
    "gramPanchayat:updated",
    () => tab === "grampanchayats" && setHasNew(true)
  );

  useSocketEvent(
    "person:new",
    () => tab === "contacts" && setHasNew(true)
  );

  useSocketEvent(
    "person:transferred",
    () => tab === "contacts" && setHasNew(true)
  );

  async function handleExport() {
    setExporting(true);

    try {
      await activityApi.downloadCsv(activityParams);
    } finally {
      setExporting(false);
    }
  }

  function setPage(page) {
    if (tab === "activity") {
      setActivityFilters((f) => ({ ...f, page }));
    } else if (tab === "grampanchayats") {
      setGpFilters((f) => ({ ...f, page }));
    } else {
      setPersonFilters((f) => ({ ...f, page }));
    }
  }

  function updateActivityFilter(key) {
    return (value) =>
      setActivityFilters((f) => ({
        ...f,
        [key]: value,
        page: 1,
      }));
  }

  function updateGpFilter(key) {
    return (value) =>
      setGpFilters((f) => ({
        ...f,
        [key]: value,
        page: 1,
        ...(key === "district" ? { taluka: "" } : {}),
      }));
  }

  function updatePersonFilter(key) {
    return (value) =>
      setPersonFilters((f) => ({
        ...f,
        [key]: value,
        page: 1,
        ...(key === "district" ? { taluka: "" } : {}),
      }));
  }

  const searchPlaceholder =
    tab === "activity"
      ? t("searchActivityPlaceholder")
      : tab === "grampanchayats"
        ? t("searchGpListPlaceholder")
        : t("searchContactsPlaceholder");

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow={t("admin")}
        title={t("explorerTitle")}
        description={t("explorerDesc")}
        action={
          tab === "activity" ? (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-outline w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              {exporting ? t("exporting") : t("exportCsv")}
            </button>
          ) : null
        }
      />

      {/* Responsive tabs */}
      <div className="grid grid-cols-1 gap-2 mb-4 sm:grid-cols-3 sm:flex">
        {TABS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={`btn min-w-0 w-full justify-center text-sm border whitespace-nowrap ${
              tab === key
                ? "border-brand-700 bg-brand-700 text-white"
                : "border-line bg-surface text-ink-soft"
            }`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{t(labelKey)}</span>
          </button>
        ))}
      </div>

      <div className="card p-3 sm:p-4 mb-4 space-y-3 min-w-0">
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          placeholder={searchPlaceholder}
        />

        {/* Activity filters */}
        {tab === "activity" && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <SlidersHorizontal className="hidden sm:block h-3.5 w-3.5 text-ink-muted flex-shrink-0" />

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={activityFilters.type}
              onChange={(e) =>
                updateActivityFilter("type")(e.target.value)
              }
            >
              <option value="">{t("allActivityTypes")}</option>
              {types.map((t2) => (
                <option key={t2.key} value={t2.key}>
                  {t2.label}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={activityFilters.designation}
              onChange={(e) =>
                updateActivityFilter("designation")(e.target.value)
              }
            >
              <option value="">{t("allDesignations")}</option>
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <input
              type="date"
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={activityFilters.from}
              onChange={(e) =>
                updateActivityFilter("from")(e.target.value)
              }
            />

            <span className="hidden sm:block text-ink-muted text-sm">
              {t("to")}
            </span>

            <input
              type="date"
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={activityFilters.to}
              onChange={(e) =>
                updateActivityFilter("to")(e.target.value)
              }
            />
          </div>
        )}

        {/* Grampanchayat filters */}
        {tab === "grampanchayats" && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <SlidersHorizontal className="hidden sm:block h-3.5 w-3.5 text-ink-muted flex-shrink-0" />

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={gpFilters.softwareUsageStatus}
              onChange={(e) =>
                updateGpFilter("softwareUsageStatus")(e.target.value)
              }
            >
              {SOFTWARE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={gpFilters.district}
              onChange={(e) =>
                updateGpFilter("district")(e.target.value)
              }
            >
              <option value="">{t("allDistricts")}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={gpFilters.taluka}
              onChange={(e) =>
                updateGpFilter("taluka")(e.target.value)
              }
            >
              <option value="">{t("allTalukas")}</option>
              {talukas.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={gpFilters.sort}
              onChange={(e) =>
                updateGpFilter("sort")(e.target.value)
              }
            >
              {GP_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Contacts filters */}
        {tab === "contacts" && (
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <SlidersHorizontal className="hidden sm:block h-3.5 w-3.5 text-ink-muted flex-shrink-0" />

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={personFilters.designation}
              onChange={(e) =>
                updatePersonFilter("designation")(e.target.value)
              }
            >
              <option value="">{t("allDesignations")}</option>
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={personFilters.softwareUsageStatus}
              onChange={(e) =>
                updatePersonFilter("softwareUsageStatus")(e.target.value)
              }
            >
              {SOFTWARE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={personFilters.district}
              onChange={(e) =>
                updatePersonFilter("district")(e.target.value)
              }
            >
              <option value="">{t("allDistricts")}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={personFilters.taluka}
              onChange={(e) =>
                updatePersonFilter("taluka")(e.target.value)
              }
            >
              <option value="">{t("allTalukas")}</option>
              {talukas.map((tk) => (
                <option key={tk} value={tk}>
                  {tk}
                </option>
              ))}
            </select>

            <select
              className="field-input w-full sm:w-auto min-w-0 text-sm py-1.5"
              value={personFilters.sort}
              onChange={(e) =>
                updatePersonFilter("sort")(e.target.value)
              }
            >
              {PERSON_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {hasNew && (
        <button
          onClick={runSearch}
          className="w-full mb-4 rounded-lg bg-accent-50 text-accent-700 text-sm font-medium py-2 hover:bg-accent-100 transition-colors"
        >
          {t("newResultsAvailable")}
        </button>
      )}

      <div className="card overflow-hidden min-w-0">
        {loading ? (
          <div className="p-4 sm:p-5">
            <SkeletonRows rows={6} />
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            title={t("noMatchingResults")}
            hint={t("tryAdjustingFilters")}
          />
        ) : tab === "activity" ? (
          <ActivityTable entries={results} t={t} />
        ) : tab === "grampanchayats" ? (
          <GramPanchayatTable results={results} t={t} />
        ) : (
          <ContactTable results={results} />
        )}

        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}

function ActivityTable({ entries, t }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <th className="px-4 py-3">{t("when")}</th>
            <th className="px-4 py-3">{t("employeeCol")}</th>
            <th className="px-4 py-3">{t("type")}</th>
            <th className="px-4 py-3">{t("contact")}</th>
            <th className="px-4 py-3">{t("grampanchayat")}</th>
            <th className="px-4 py-3">{t("notesCol")}</th>
            <th className="px-4 py-3">{t("time")}</th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry._id}
              className="border-b border-line last:border-0 hover:bg-canvas/60"
            >
              <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                {formatDateTime(entry.date)}
              </td>

              <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                {entry.employeeId?.name}
              </td>

              <td className="px-4 py-3">
                <div className="flex flex-col gap-1 items-start">
                  <Badge tone="brand">
                    {activityTypeLabel(entry.type)}
                  </Badge>

                  {entry.clientInterest && (
                    <Badge tone={clientInterestTone(entry.clientInterest)}>
                      {activityTypeLabel(entry.clientInterest)}
                    </Badge>
                  )}
                </div>
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {entry.personId?.name ? (
                  <Link
                    to={`/admin/contacts/${entry.personId._id}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <span>{entry.personId.name}</span>
                    <Badge
                      tone={designationTone(entry.designationSnapshot)}
                    >
                      {entry.designationSnapshot}
                    </Badge>
                  </Link>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>

              <td className="px-4 py-3 whitespace-nowrap text-ink-soft">
                {entry.gramPanchayatId?.name ? (
                  <Link
                    to={`/admin/grampanchayats/${entry.gramPanchayatId._id}`}
                    className="hover:underline"
                  >
                    {entry.gramPanchayatId.name}
                  </Link>
                ) : (
                  "—"
                )}
              </td>

              <td className="px-4 py-3 text-ink-soft max-w-xs truncate">
                {entry.notes}
              </td>

              <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                {entry.durationMinutes
                  ? `${entry.durationMinutes} min`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GramPanchayatTable({ results, t }) {
  return (
    <ul className="divide-y divide-line">
      {results.map((gp) => (
        <li key={gp._id}>
          <Link
            to={`/admin/grampanchayats/${gp._id}`}
            className="
              flex flex-col gap-3
              px-4 py-3.5
              sm:flex-row sm:items-center sm:justify-between
              sm:px-5
              hover:bg-canvas/60
              transition-colors
            "
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink break-words">
                {gp.name}
                {gp.nameMr ? ` · ${gp.nameMr}` : ""}
              </p>

              <p className="text-xs text-ink-muted mt-0.5 break-words">
                {gp.taluka}, {gp.district}
              </p>
            </div>

            <div
              className="
                flex flex-wrap items-center gap-2
                w-full sm:w-auto
                min-w-0
              "
            >
              <Badge tone={softwareStatusTone(gp.softwareUsageStatus)}>
                {softwareStatusLabel(gp.softwareUsageStatus)}
              </Badge>

              {gp.lastContactedAt && (
                <span className="text-xs text-ink-muted">
                  {t("lastContact")} {formatDate(gp.lastContactedAt)}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ContactTable({ results }) {
  return (
    <ul className="divide-y divide-line">
      {results.map((p) => {
        const currentGp = p.currentPostings?.[0]?.gramPanchayatId;

        return (
          <li key={p._id}>
            <Link
              to={`/admin/contacts/${p._id}`}
              className="
                flex flex-col gap-3
                px-4 py-3.5
                sm:flex-row sm:items-center sm:justify-between
                sm:px-5
                hover:bg-canvas/60
                transition-colors
              "
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink break-words">
                  {p.name}
                  {p.nameMr ? ` · ${p.nameMr}` : ""}
                </p>

                <p className="text-xs text-ink-muted mt-0.5 break-words leading-5">
                  {p.phone || "No phone"}
                  {" · "}
                  {currentGp
                    ? `${currentGp.name}, ${currentGp.taluka}`
                    : "No current posting"}
                  {p.totalGramPanchayatsHandled > 1
                    ? ` · ${p.totalGramPanchayatsHandled} GPs`
                    : ""}
                </p>
              </div>

              <div
                className="
                  flex flex-wrap items-center gap-2
                  w-full sm:w-auto
                  min-w-0
                "
              >
                {currentGp?.softwareUsageStatus && (
                  <Badge
                    tone={softwareStatusTone(
                      currentGp.softwareUsageStatus
                    )}
                  >
                    {softwareStatusLabel(currentGp.softwareUsageStatus)}
                  </Badge>
                )}

                <Badge tone={designationTone(p.designation)}>
                  {p.designation}
                </Badge>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}