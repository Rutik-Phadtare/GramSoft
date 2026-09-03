import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { taskApi } from "../../api/tasks";
import { employeeApi } from "../../api/employees";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useNotifications } from "../../context/NotificationContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate, formatDateTime } from "../../utils/format";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];
const TASK_STATUS_TONE = { pending: "outline", in_progress: "accent", completed: "brand", cancelled: "signal" };

export default function AdminTasks() {
  const { t } = useLanguage();
  const [status, setStatus] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", employeeId: "", gramPanchayat: null, priority: "normal", dueDate: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function refresh() {
    setLoading(true);
    taskApi.list({ status: status || undefined, limit: 100 }).then((d) => setTasks(d.tasks)).finally(() => setLoading(false));
  }

  useEffect(refresh, [status]);
  const { markSectionRead } = useNotifications();
  useEffect(() => { markSectionRead("tasks"); }, []);
  useEffect(() => {
    employeeApi.list().then((d) => setEmployees(d.employees.filter((e) => e.role === "employee")));
  }, []);
  useSocketEvent("task:new", refresh);
  useSocketEvent("task:updated", refresh);
  useSocketEvent("task:deleted", refresh);

  const searchGramPanchayats = (q) => gramPanchayatApi.list({ q }).then((d) => d.results);

  function openModal() {
    setForm({ title: "", description: "", employeeId: "", gramPanchayat: null, priority: "normal", dueDate: "" });
    setError("");
    setModalOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.title || !form.employeeId) {
      setError("Title and an employee to assign are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await taskApi.create({
        title: form.title,
        description: form.description,
        assignedTo: form.employeeId,
        gramPanchayatId: form.gramPanchayat?._id,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
      });
      setModalOpen(false);
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tasks"
        title="Employee tasks"
        description="Assign specific to-dos to employees and see status and reports come back."
        action={
          <button onClick={openModal} className="btn btn-primary">
            <Plus className="h-4 w-4" /> Assign task
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setStatus(tb.key)}
            className={`btn text-sm border ${status === tb.key ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-5"><SkeletonRows rows={5} /></div>
        ) : tasks.length === 0 ? (
          <EmptyState title="No tasks here yet" hint="Assign one from here or from an employee's profile." />
        ) : (
          <ul className="divide-y divide-line">
            {tasks.map((task) => (
              <li key={task._id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
                  <div>
                    <p className="text-sm font-semibold text-ink">{task.title}</p>
                    <p className="text-xs text-ink-muted">
                      Assigned to{" "}
                      <Link to={`/admin/employees/${task.assignedTo?._id}`} className="underline hover:text-ink-soft">
                        {task.assignedTo?.name || "—"}
                      </Link>
                      {" · "}by {task.assignedBy?.name || "—"} · {formatDateTime(task.createdAt)}
                    </p>
                  </div>
                  <Badge tone={TASK_STATUS_TONE[task.status] || "outline"}>{task.status.replace("_", " ")}</Badge>
                </div>
                {task.description && <p className="text-sm text-ink-soft mb-1">{task.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
                  {task.gramPanchayatId?.name && (
                    <Link to={`/admin/grampanchayats/${task.gramPanchayatId._id}`} className="hover:underline">
                      {task.gramPanchayatId.name}
                    </Link>
                  )}
                  {task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
                  <span className="capitalize">{task.priority} priority</span>
                </div>
                {task.report && (
                  <div className="rounded-lg bg-canvas p-3 text-sm mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1">Report</p>
                    <p className="text-ink-soft">{task.report}</p>
                    {task.reportedAt && <p className="text-xs text-ink-muted mt-1">{formatDateTime(task.reportedAt)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign a task">
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
          <div>
            <label className="field-label">Employee</label>
            <select className="field-input" value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
              <option value="">Choose an employee…</option>
              {employees.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Title</label>
            <input className="field-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Attend software demo" />
          </div>
          <div>
            <label className="field-label">Details</label>
            <textarea className="field-textarea" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <EntitySearchSelect
            label="Grampanchayat (optional)"
            fetchResults={searchGramPanchayats}
            value={form.gramPanchayat}
            onChange={(gp) => setForm((f) => ({ ...f, gramPanchayat: gp }))}
            renderOption={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
            renderSelected={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Priority</label>
              <select className="field-input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input type="date" className="field-input" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? t("saving") : "Assign task"}</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
