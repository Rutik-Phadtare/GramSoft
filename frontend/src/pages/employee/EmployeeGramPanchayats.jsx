import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark } from "lucide-react";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { useAuth } from "../../context/AuthContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import Badge, { softwareStatusTone } from "../../components/Badge";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { softwareStatusLabel } from "../../utils/format";

const PAGE_SIZE = 25;

// The employee-facing counterpart to AdminGramPanchayats - same directory,
// but read-only: no create/delete/export, and the backend already strips
// billing/pricing fields for anyone whose "view financials" permission is
// off. This page only renders at all if the employee's "view
// Grampanchayats" permission is on (see Sidebar / App route guard).
export default function EmployeeGramPanchayats() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const debouncedQuery = useDebouncedValue(query, 300);

  const canView = user?.role === "admin" || user?.permissions?.viewGramPanchayats !== false;

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    gramPanchayatApi
      .list({ q: debouncedQuery || undefined, page, limit: PAGE_SIZE })
      .then((data) => {
        setResults(data.results);
        setPagination(data.pagination);
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery, page, canView]);

  if (!canView) {
    return (
      <div>
        <PageHeader eyebrow="Directory" title="Grampanchayats" />
        <EmptyState title="You don't have access to this" hint="Ask an admin to turn on Grampanchayat viewing for your account." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Directory" title="Grampanchayats" description="Browse Grampanchayat records to help with your work." />

      <div className="mb-4">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Search by name…" className="max-w-sm" />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={6} /></div>
        ) : results.length === 0 ? (
          <EmptyState title="No Grampanchayats found" />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((gp) => (
              <li key={gp._id}>
                <Link to={`/grampanchayats/${gp._id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-canvas/60 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                      <Landmark className="h-4 w-4 text-brand-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{gp.name}{gp.nameMr ? ` · ${gp.nameMr}` : ""}</p>
                      <p className="text-xs text-ink-muted truncate">{gp.taluka}, {gp.district}</p>
                    </div>
                  </div>
                  <Badge tone={softwareStatusTone(gp.softwareUsageStatus)}>{softwareStatusLabel(gp.softwareUsageStatus)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
}
