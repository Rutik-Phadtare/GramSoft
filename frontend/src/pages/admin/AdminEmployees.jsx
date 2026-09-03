import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Power } from "lucide-react";
import { employeeApi } from "../../api/employees";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";

const emptyForm = { name: "", email: "", password: "", role: "employee", team: "sales" };

export default function AdminEmployees() {
  const { t } = useLanguage();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function refresh() {
    setLoading(true);
    employeeApi.list().then((data) => setEmployees(data.employees)).finally(() => setLoading(false));
  }

  useEffect(refresh, []);
  useSocketEvent("employee:new", refresh);
  useSocketEvent("employee:updated", refresh);
  useSocketEvent("employee:deleted", refresh);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("Name, email, and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await employeeApi.create(form);
      setModalOpen(false);
      setForm(emptyForm);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(emp) {
    setBusyId(emp._id);
    try {
      await employeeApi.update(emp._id, { active: !emp.active });
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("team")}
        title={t("employeesTitle")}
        description={t("employeesDesc")}
        action={
          <button onClick={() => setModalOpen(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" /> {t("addEmployee")}
          </button>
        }
      />

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={5} /></div>
        ) : employees.length === 0 ? (
          <EmptyState title={t("noEmployeesYet")} />
        ) : (
          <ul className="divide-y divide-line">
            {employees.map((emp) => (
              <li key={emp._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <Link to={`/admin/employees/${emp._id}`} className="min-w-0 hover:underline">
                  <p className="text-sm font-medium text-ink truncate">{emp.name}</p>
                  <p className="text-xs text-ink-muted truncate">{emp.email}</p>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge tone={emp.role === "admin" ? "accent" : "brand"}>{emp.role}</Badge>
                  {emp.team && <Badge tone="outline">{emp.team}</Badge>}
                  <Badge tone={emp.active ? "brand" : "signal"}>{emp.active ? t("active") : t("inactive")}</Badge>
                  <button
                    onClick={() => toggleActive(emp)}
                    disabled={busyId === emp._id}
                    title={emp.active ? "Deactivate" : "Activate"}
                    className="p-1.5 rounded-md text-ink-muted hover:text-ink-soft hover:bg-canvas"
                  >
                    <Power className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t("addEmployee")}>
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
          <div>
            <label className="field-label">{t("name")}</label>
            <input className="field-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">{t("email")}</label>
            <input type="email" className="field-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">{t("temporaryPassword")}</label>
            <input className="field-input" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">{t("role")}</label>
              <select className="field-input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                <option value="employee">{t("employee")}</option>
                <option value="admin">{t("admin")}</option>
              </select>
            </div>
            {form.role === "employee" && (
              <div>
                <label className="field-label">{t("team")}</label>
                <select className="field-input" value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}>
                  <option value="sales">{t("sales")}</option>
                  <option value="support">{t("support")}</option>
                </select>
              </div>
            )}
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
