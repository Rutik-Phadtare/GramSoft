import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, SlidersHorizontal, ShieldCheck, ClipboardList, Plus, Download } from "lucide-react";
import { employeeApi } from "../../api/employees";
import { activityApi } from "../../api/activities";
import { activityTypeApi } from "../../api/activityTypes";
import { taskApi } from "../../api/tasks";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import Pagination from "../../components/Pagination";
import EmptyState from "../../components/EmptyState";
import Toggle from "../../components/Toggle";
import ActivityLogCard from "../../components/ActivityLogCard";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate } from "../../utils/format";

const PAGE_SIZE = 20;

const TASK_STATUS_TONE = { pending: "outline", in_progress: "accent", completed: "brand", cancelled: "signal" };

export default function AdminEmployeeDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [employee, setEmployee] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [permissionRegistry, setPermissionRegistry] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [permissionsDirty, setPermissionsDirty] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", description: "", gramPanchayat: null, priority: "normal", dueDate: "" });
  const [taskError, setTaskError] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);

  function refreshProfile() {
    employeeApi.get(id).then((d) => {
      setEmployee(d.employee);
      setStats(d.stats);
      // Defaults come from the registry itself (each entry's `default`),
      // never hardcoded here - a new permission added on the backend shows
      // up correctly defaulted without touching this page.
      const defaults = Object.fromEntries((permissionRegistry || []).map((p) => [p.key, p.default]));
      setPermissions({ ...defaults, ...d.employee.permissions });
      setPermissionsDirty(false);
    }).finally(() => setLoadingProfile(false));
  }

  function refreshTasks() {
    setLoadingTasks(true);
    taskApi.list({ assignedTo: id, limit: 50 }).then((d) => setTasks(d.tasks)).finally(() => setLoadingTasks(false));
  }

  const searchGramPanchayats = (q) => gramPanchayatApi.list({ q }).then((d) => d.results);

  async function savePermissions() {
    setSavingPermissions(true);
    try {
      const d = await employeeApi.update(id, { permissions });
      setEmployee(d.employee);
      setPermissionsDirty(false);
    } finally {
      setSavingPermissions(false);
    }
  }

  function openAssignTask() {
    setTaskForm({ title: "", description: "", gramPanchayat: null, priority: "normal", dueDate: "" });
    setTaskError("");
    setTaskModalOpen(true);
  }

  async function submitTask(e) {
    e.preventDefault();
    if (!taskForm.title) {
      setTaskError("Give the task a title.");
      return;
    }
    setTaskSaving(true);
    setTaskError("");
    try {
      await taskApi.create({
        title: taskForm.title,
        description: taskForm.description,
        assignedTo: id,
        gramPanchayatId: taskForm.gramPanchayat?._id,
        priority: taskForm.priority,
        dueDate: taskForm.dueDate || undefined,
      });
      setTaskModalOpen(false);
      refreshTasks();
    } catch (err) {
      setTaskError(apiErrorMessage(err));
    } finally {
      setTaskSaving(false);
    }
  }

  const params = useMemo(
    () => ({ employeeId: id, type: type || undefined, from: from || undefined, to: to || undefined, page, limit: PAGE_SIZE }),
    [id, type, from, to, page]
  );

  function refreshLogs() {
    setLoadingLogs(true);
    activityApi.list(params).then((data) => {
      setEntries(data.entries);
      setPagination(data.pagination);
    }).finally(() => setLoadingLogs(false));
  }

  async function downloadLogsReport() {
    setExportingLogs(true);
    try {
      // Reuses the exact same filters (type/date range) currently applied
      // on screen, so the download matches what the admin is looking at -
      // not just the current page of it.
      await activityApi.downloadCsv({ employeeId: id, type: type || undefined, from: from || undefined, to: to || undefined });
    } finally {
      setExportingLogs(false);
    }
  }

  useEffect(() => {
    employeeApi.permissionRegistry().then((d) => setPermissionRegistry(d.permissions)).catch(() => setPermissionRegistry([]));
  }, []);
  // Waits on permissionRegistry so defaults are computed from real data
  // (not guessed) the first time a profile loads.
  useEffect(() => {
    if (permissionRegistry) refreshProfile();
  }, [id, permissionRegistry]);
  useEffect(refreshLogs, [params]);
  useEffect(refreshTasks, [id]);
  useEffect(() => {
    activityTypeApi.list().then((data) => setTypes(data.types));
  }, []);

  useSocketEvent("task:new", (t) => {
    if (t.assignedTo?._id === id) refreshTasks();
  });
  useSocketEvent("task:updated", (t) => {
    if (t.assignedTo?._id === id) refreshTasks();
  });

  useSocketEvent("activity:new", (entry) => {
    if (entry.employeeId?._id === id || entry.employeeId === id) {
      refreshProfile();
      refreshLogs();
    }
  });

  function updateFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  if (loadingProfile || !employee) {
    return <div className="max-w-3xl"><SkeletonRows rows={6} /></div>;
  }

  return (
    <div>
      <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-soft mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> {t("backToEmployees")}
      </Link>

      <PageHeader
        eyebrow={employee.role === "admin" ? t("admin") : employee.team || t("employee")}
        title={employee.name}
        description={employee.email}
        action={<Badge tone={employee.active ? "brand" : "signal"}>{employee.active ? t("active") : t("inactive")}</Badge>}
      />

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mb-6">
        <StatCard label={t("loggedToday")} value={stats.logsToday} />
        <StatCard label={t("thisWeek")} value={stats.logsThisWeek} />
        <StatCard label={t("totalLogs")} value={stats.totalLogs} tone="accent" />
        <StatCard label={t("firstLogged")} value={stats.firstLoggedAt ? formatDate(stats.firstLoggedAt) : "—"} />
      </div>

      {employee.role !== "admin" && (
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="font-display text-sm font-semibold text-ink">Permissions</h2>
            </div>
            <p className="text-xs text-ink-muted mb-3">
              What {employee.name} can see and propose changes to. Proposed edits always need an admin's approval before they land in the real records.
            </p>
            {!permissionRegistry || !permissions ? (
              <SkeletonRows rows={4} />
            ) : (
              <div className="space-y-4">
                {Object.entries(
                  permissionRegistry.reduce((groups, p) => {
                    (groups[p.group] = groups[p.group] || []).push(p);
                    return groups;
                  }, {})
                ).map(([group, items]) => (
                  <div key={group}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">{group}</p>
                    <div className="space-y-2.5">
                      {items.map(({ key, label, hint }) => (
                        <div key={key} className="flex items-start gap-3">
                          <Toggle
                            checked={permissions[key] !== false}
                            onChange={(val) => {
                              setPermissions((p) => ({ ...p, [key]: val }));
                              setPermissionsDirty(true);
                            }}
                            label={label}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink">{label}</span>
                            <span className="block text-xs text-ink-muted">{hint}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={savePermissions}
                  disabled={savingPermissions || !permissionsDirty}
                  className="btn btn-primary text-sm py-1.5 mt-1"
                >
                  {savingPermissions ? t("saving") : permissionsDirty ? "Save permissions" : "Saved"}
                </button>
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-brand-600" />
                <h2 className="font-display text-sm font-semibold text-ink">Assigned tasks</h2>
              </div>
              <button onClick={openAssignTask} className="btn btn-outline text-xs py-1 px-2">
                <Plus className="h-3.5 w-3.5" /> Assign task
              </button>
            </div>
            <p className="text-xs text-ink-muted mb-3">Give {employee.name} something specific to do, and get a report back once it's done.</p>
            {loadingTasks ? (
              <SkeletonRows rows={3} />
            ) : tasks.length === 0 ? (
              <p className="text-sm text-ink-muted">No tasks assigned yet.</p>
            ) : (
              <ul className="divide-y divide-line -mx-1">
                {tasks.map((task) => (
                  <li key={task._id} className="py-2.5 px-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{task.title}</p>
                      <Badge tone={TASK_STATUS_TONE[task.status] || "outline"}>{task.status.replace("_", " ")}</Badge>
                    </div>
                    {task.gramPanchayatId?.name && (
                      <p className="text-xs text-ink-muted mt-0.5">{task.gramPanchayatId.name}</p>
                    )}
                    {task.dueDate && <p className="text-xs text-ink-muted mt-0.5">Due {formatDate(task.dueDate)}</p>}
                    {task.report && (
                      <p className="text-xs text-ink-soft mt-1 italic">"{task.report}"</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
            <select className="field-input w-auto text-sm py-1.5" value={type} onChange={(e) => updateFilter(setType)(e.target.value)}>
              <option value="">{t("allActivityTypes")}</option>
              {types.map((t2) => <option key={t2.key} value={t2.key}>{t2.label}</option>)}
            </select>
            <input type="date" className="field-input w-auto text-sm py-1.5" value={from} onChange={(e) => updateFilter(setFrom)(e.target.value)} />
            <span className="text-ink-muted text-sm">{t("to")}</span>
            <input type="date" className="field-input w-auto text-sm py-1.5" value={to} onChange={(e) => updateFilter(setTo)(e.target.value)} />
          </div>
          <button onClick={downloadLogsReport} disabled={exportingLogs} className="btn btn-outline text-sm py-1.5">
            <Download className="h-3.5 w-3.5" /> {exportingLogs ? "Preparing…" : "Download report"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold text-ink mb-3">{t("dailyLogSection")}</h2>
        {loadingLogs ? (
          <SkeletonRows rows={6} />
        ) : entries.length === 0 ? (
          <div className="card"><EmptyState title={t("noLogEntriesInRange")} /></div>
        ) : (
          <div className="space-y-2.5">
            {entries.map((entry) => (
              <ActivityLogCard key={entry._id} entry={entry} />
            ))}
          </div>
        )}
        <div className="card mt-2">
          <Pagination pagination={pagination} onPageChange={setPage} />
        </div>
      </div>

      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={`Assign a task to ${employee.name}`}>
        <form onSubmit={submitTask} className="space-y-4">
          {taskError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{taskError}</div>}
          <div>
            <label className="field-label">Title</label>
            <input className="field-input" value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Attend software demo" />
          </div>
          <div>
            <label className="field-label">Details</label>
            <textarea className="field-textarea" rows={3} value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <EntitySearchSelect
            label="Grampanchayat (optional)"
            fetchResults={searchGramPanchayats}
            value={taskForm.gramPanchayat}
            onChange={(gp) => setTaskForm((f) => ({ ...f, gramPanchayat: gp }))}
            renderOption={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
            renderSelected={(gp) => <div><p className="text-sm font-medium text-ink">{gp.name}</p><p className="text-xs text-ink-muted">{gp.taluka}, {gp.district}</p></div>}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Priority</label>
              <select className="field-input" value={taskForm.priority} onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input type="date" className="field-input" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={taskSaving} className="btn btn-primary">{taskSaving ? t("saving") : "Assign task"}</button>
            <button type="button" onClick={() => setTaskModalOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
