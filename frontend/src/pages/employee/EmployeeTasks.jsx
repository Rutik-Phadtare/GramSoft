import { useEffect, useState } from "react";
import { ClipboardList, Landmark, CalendarClock } from "lucide-react";
import { taskApi } from "../../api/tasks";
import { apiErrorMessage } from "../../api/client";
import { useSocketEvent } from "../../context/SocketContext";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";
import { formatDate } from "../../utils/format";
import { displayName } from "../../utils/i18nData";
import { useLanguage } from "../../context/LanguageContext";

const STATUS_TONE = { pending: "outline", in_progress: "accent", completed: "brand", cancelled: "signal" };
const STATUS_LABEL = { pending: "Pending", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled" };
const NEXT_STATUS = { pending: "in_progress", in_progress: "completed" };
const NEXT_LABEL = { pending: "Start", in_progress: "Mark complete" };

export default function EmployeeTasks() {
  const { language } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [reportDrafts, setReportDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  function refresh() {
    setLoading(true);
    taskApi
      .list({ status: statusFilter || undefined, limit: 100 })
      .then((d) => setTasks(d.tasks))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [statusFilter]);
  useSocketEvent("task:new", refresh);
  useSocketEvent("task:updated", refresh);

  async function advance(task) {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;
    setSavingId(task._id);
    try {
      await taskApi.updateStatus(task._id, { status: nextStatus, report: reportDrafts[task._id] });
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  async function saveReportOnly(task) {
    setSavingId(task._id);
    try {
      await taskApi.updateStatus(task._id, { report: reportDrafts[task._id] });
      refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Assigned to you"
        title="My tasks"
        description="Things an admin has specifically asked you to do. Update status and leave a short report once you're done."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {["", "pending", "in_progress", "completed", "cancelled"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s ? "bg-ink text-white" : "bg-surface border border-line text-ink-soft hover:bg-canvas"
            }`}
          >
            {s ? STATUS_LABEL[s] : "All"}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{error}</div>}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No tasks here"
            hint="When an admin assigns you something, it'll show up on this page."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task._id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ClipboardList className="h-4 w-4 text-brand-600" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink break-words">{task.title}</p>
                    {task.description && <p className="text-sm text-ink-soft mt-0.5">{task.description}</p>}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[task.status] || "outline"}>{STATUS_LABEL[task.status] || task.status}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted ml-[42px] mb-3">
                {displayName(task.gramPanchayatId, language).primary && (
                  <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" /> {displayName(task.gramPanchayatId, language).primary}</span>
                )}
                {task.dueDate && (
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Due {formatDate(task.dueDate)}</span>
                )}
                {task.priority === "high" && <Badge tone="signal">High priority</Badge>}
              </div>

              {task.status !== "cancelled" && (
                <div className="ml-[42px] flex flex-col sm:flex-row gap-2">
                  <textarea
                    className="field-textarea flex-1 text-sm"
                    rows={2}
                    placeholder="Add a report (optional) — what happened, what's next..."
                    defaultValue={task.report || ""}
                    onChange={(e) => setReportDrafts((d) => ({ ...d, [task._id]: e.target.value }))}
                  />
                  <div className="flex sm:flex-col gap-2 flex-shrink-0">
                    {NEXT_STATUS[task.status] && (
                      <button
                        onClick={() => advance(task)}
                        disabled={savingId === task._id}
                        className="btn btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
                      >
                        {savingId === task._id ? "Saving…" : NEXT_LABEL[task.status]}
                      </button>
                    )}
                    <button
                      onClick={() => saveReportOnly(task)}
                      disabled={savingId === task._id}
                      className="btn btn-outline text-xs py-1.5 px-3 whitespace-nowrap"
                    >
                      Save report
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
