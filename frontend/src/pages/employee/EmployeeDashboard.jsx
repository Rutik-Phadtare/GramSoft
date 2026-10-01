import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardEdit, ClipboardList } from "lucide-react";
import { employeeApi } from "../../api/employees";
import { taskApi } from "../../api/tasks";
import { useAuth } from "../../context/AuthContext";
import { useSocketEvent } from "../../context/SocketContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import LiveActivityFeed from "../../components/LiveActivityFeed";
import Badge from "../../components/Badge";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate } from "../../utils/format";
import { displayName } from "../../utils/i18nData";

const TASK_STATUS_TONE = { pending: "outline", in_progress: "accent", completed: "brand", cancelled: "signal" };
const NEXT_STATUS = { pending: "in_progress", in_progress: "completed" };
const NEXT_STATUS_LABEL = { pending: "Start", in_progress: "Mark done" };

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [reportDraft, setReportDraft] = useState({}); // taskId -> in-progress report text
  const [savingTaskId, setSavingTaskId] = useState(null);

  function refresh() {
    employeeApi
      .myOverview()
      .then(setData)
      .finally(() => setLoading(false));
  }

  function refreshTasks() {
    setLoadingTasks(true);
    taskApi
      .list({ status: "" })
      .then((d) => setTasks(d.tasks.filter((task) => task.status !== "cancelled")))
      .finally(() => setLoadingTasks(false));
  }

  useEffect(() => {
    refresh();
    refreshTasks();
  }, []);

  useSocketEvent("task:new", refreshTasks);
  useSocketEvent("task:updated", refreshTasks);
  useSocketEvent("task:deleted", refreshTasks);

  async function advanceTask(task) {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;
    setSavingTaskId(task._id);
    try {
      await taskApi.updateStatus(task._id, {
        status: nextStatus,
        ...(nextStatus === "completed" ? { report: reportDraft[task._id] || task.report || "" } : {}),
      });
      refreshTasks();
    } finally {
      setSavingTaskId(null);
    }
  }

  async function saveReportOnly(task) {
    setSavingTaskId(task._id);
    try {
      await taskApi.updateStatus(task._id, { report: reportDraft[task._id] ?? task.report ?? "" });
      refreshTasks();
    } finally {
      setSavingTaskId(null);
    }
  }

  // Own new entries stream straight to the top of the feed the instant
  // they're saved - this is the "log it and see it land here" loop.
  useSocketEvent("activity:new", (entry) => {
    setData((prev) => {
      if (!prev) return prev;
      const alreadyThere = prev.entries.some((e) => e._id === entry._id);
      if (alreadyThere) return prev;
      return {
        ...prev,
        entries: [entry, ...prev.entries].slice(0, 10),
        stats: {
          ...prev.stats,
          entriesThisWeek: prev.stats.entriesThisWeek + 1,
          loggedToday: prev.stats.loggedToday + 1,
        },
      };
    });
  });

  const firstName = user?.name?.split(" ")[0];

  return (
    <div>
      <PageHeader
        eyebrow={t("employeeDashboardTitle")}
        title={`${t("employeeDashboardTitle")}, ${firstName || ""}`}
        description={t("employeeDashboardDesc")}
        action={
          <Link to="/activity/new" className="btn btn-primary">
            <ClipboardEdit className="h-4 w-4" />
            {t("logActivity")}
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <StatCard label={t("loggedToday")} value={loading ? "—" : data?.stats.loggedToday ?? 0} />
        <StatCard label={t("thisWeek")} value={loading ? "—" : data?.stats.entriesThisWeek ?? 0} hint={t("last7Days")} />
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="h-4 w-4 text-brand-600" />
          <h2 className="font-display text-sm font-semibold text-ink">My Tasks</h2>
        </div>
        <p className="text-xs text-ink-muted mb-3">Things your admin has assigned to you. Update the status and leave a report once you're done.</p>
        {loadingTasks ? (
          <SkeletonRows rows={3} />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing assigned right now.</p>
        ) : (
          <ul className="divide-y divide-line -mx-1">
            {tasks.map((task) => (
              <li key={task._id} className="py-3 px-1">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-sm font-medium text-ink">{task.title}</p>
                    {displayName(task.gramPanchayatId, language).primary && <p className="text-xs text-ink-muted">{displayName(task.gramPanchayatId, language).primary}</p>}
                    {task.dueDate && <p className="text-xs text-ink-muted">Due {formatDate(task.dueDate)}</p>}
                  </div>
                  <Badge tone={TASK_STATUS_TONE[task.status] || "outline"}>{task.status.replace("_", " ")}</Badge>
                </div>
                {task.description && <p className="text-sm text-ink-soft mb-2">{task.description}</p>}
                {task.status !== "completed" && (
                  <div className="space-y-2">
                    <textarea
                      className="field-textarea text-sm"
                      rows={2}
                      placeholder="Add a note or report (optional until marking done)…"
                      value={reportDraft[task._id] ?? task.report ?? ""}
                      onChange={(e) => setReportDraft((d) => ({ ...d, [task._id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS[task.status] && (
                        <button
                          onClick={() => advanceTask(task)}
                          disabled={savingTaskId === task._id}
                          className="btn btn-primary text-sm py-1.5"
                        >
                          {savingTaskId === task._id ? t("saving") : NEXT_STATUS_LABEL[task.status]}
                        </button>
                      )}
                      <button
                        onClick={() => saveReportOnly(task)}
                        disabled={savingTaskId === task._id}
                        className="btn btn-outline text-sm py-1.5"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                )}
                {task.status === "completed" && task.report && (
                  <p className="text-sm text-ink-soft italic">"{task.report}"</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <h2 className="font-display text-sm font-semibold text-ink mb-1">{t("yourRecentActivity")}</h2>
        <p className="text-xs text-ink-muted mb-3">{t("updatesLive")}</p>
        {loading ? (
          <SkeletonRows rows={4} />
        ) : data?.entries?.length ? (
          <LiveActivityFeed entries={data.entries} />
        ) : (
          <EmptyState
            title={t("noActivityYet")}
            hint="Once you log a call or visit, it will show up here."
            action={
              <Link to="/activity/new" className="btn btn-primary mt-2">
                {t("logFirstEntry")}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}
