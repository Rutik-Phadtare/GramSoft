import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Pencil, Landmark } from "lucide-react";
import { personApi } from "../../api/persons";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import SearchInput from "../../components/SearchInput";
import Badge, { designationTone } from "../../components/Badge";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";

const PAGE_SIZE = 25;
const emptyForm = {
  name: "", nameMr: "", designation: "", phone: "", email: "",
  address: "", addressMr: "", district: "", notes: "",
};

export default function EmployeeContacts() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const debouncedQuery = useDebouncedValue(query, 300);

  const [proposeTarget, setProposeTarget] = useState(null);
  const [proposeForm, setProposeForm] = useState(emptyForm);
  const [proposeError, setProposeError] = useState("");
  const [proposeSaving, setProposeSaving] = useState(false);
  const [proposed, setProposed] = useState(false);

  const canPropose = user?.role === "admin" || user?.permissions?.editContacts !== false;
  const canView = user?.role === "admin" || user?.permissions?.viewContacts !== false;

  function refresh() {
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    personApi.list({ q: debouncedQuery || undefined, withHistory: true, page, limit: PAGE_SIZE })
      .then((data) => { setResults(data.results); setPagination(data.pagination); })
      .finally(() => setLoading(false));
  }
  useEffect(refresh, [debouncedQuery, page, canView]);

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
        <SearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder={t("search")} />
      </div>

      <div className="card overflow-hidden">
        {loading ? <div className="p-5"><SkeletonRows rows={6} /></div> : results.length === 0 ? (
          <EmptyState title="No contacts found" hint="Try another name or phone number." />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((p) => {
              const currentGps = p.currentPostings || [];
              return (
                <li key={p._id}>
                  <div className="flex items-start justify-between gap-3 px-5 py-3.5">
                    <Link to={`/contacts`} className="min-w-0 flex-1 hover:bg-canvas/50 rounded-lg -m-2 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-ink truncate">{p.name}{p.nameMr ? ` · ${p.nameMr}` : ""}</p>
                        <Badge tone={designationTone(p.designation)}>{p.designation}</Badge>
                      </div>
                      <p className="text-xs text-ink-muted truncate">{p.phone || "No phone"}{p.email ? ` · ${p.email}` : ""}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {currentGps.length ? currentGps.map((a) => (
                          <span key={a._id} className="inline-flex items-center gap-1 text-xs text-ink-soft">
                            <Landmark className="h-3 w-3" /> {a.gramPanchayatId?.name}{a.gramPanchayatId?.taluka ? `, ${a.gramPanchayatId.taluka}` : ""}
                          </span>
                        )) : <span className="text-xs text-ink-muted">No current workplace recorded</span>}
                      </div>
                    </Link>
                    {canPropose && <button type="button" onClick={() => openPropose(p)} className="btn btn-outline text-xs py-1.5"><Pencil className="h-3.5 w-3.5" /> Propose change</button>}
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
    </div>
  );
}
