import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Landmark, MonitorCheck, Users, Activity, Inbox, UserCog } from "lucide-react";
import { overviewApi } from "../../api/overview";
import { useSocketEvent } from "../../context/SocketContext";
import { useNotifications } from "../../context/NotificationContext";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import StatCard from "../../components/StatCard";
import LiveActivityFeed from "../../components/LiveActivityFeed";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    overviewApi
      .admin()
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);
  const { markSectionRead } = useNotifications();
  useEffect(() => { markSectionRead("dashboard"); }, []);

  // The heart of "owner sees everything, live" - every activity entry from
  // every employee lands here the instant it's saved, no refresh needed.
  useSocketEvent("activity:new", (entry) => {
    setData((prev) => {
      if (!prev) return prev;
      if (prev.recent.some((e) => e._id === entry._id)) return prev;
      return {
        ...prev,
        recent: [entry, ...prev.recent].slice(0, 20),
        stats: { ...prev.stats, activitiesThisWeek: prev.stats.activitiesThisWeek + 1 },
      };
    });
  });
  useSocketEvent("feedback:new", () => {
    setData((prev) => (prev ? { ...prev, stats: { ...prev.stats, pendingFeedback: prev.stats.pendingFeedback + 1 } } : prev));
  });
  useSocketEvent("gramPanchayat:new", () => {
    setData((prev) => (prev ? { ...prev, stats: { ...prev.stats, totalGPs: prev.stats.totalGPs + 1 } } : prev));
  });
  useSocketEvent("person:new", () => {
    setData((prev) => (prev ? { ...prev, stats: { ...prev.stats, totalContacts: prev.stats.totalContacts + 1 } } : prev));
  });

  const stats = data?.stats;

  return (
    <div>
      <PageHeader
        eyebrow={t("ownerOverview")}
        title={t("everythingAtAGlance")}
        description={t("liveAcrossEveryone")}
        action={
          <Link to="/admin/explorer" className="btn btn-outline">
            <Search className="h-4 w-4" />
            {t("openExplorer")}
          </Link>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard label={t("grampanchayats")} value={loading ? "—" : stats?.totalGPs ?? 0} icon={Landmark} />
        <StatCard label={t("usingOurSoftware")} value={loading ? "—" : stats?.usingSoftwareGPs ?? 0} tone="accent" icon={MonitorCheck} />
        <StatCard label={t("contactsOnFile")} value={loading ? "—" : stats?.totalContacts ?? 0} icon={Users} />
        <StatCard label={t("activityThisWeek")} value={loading ? "—" : stats?.activitiesThisWeek ?? 0} icon={Activity} />
        <StatCard label={t("pendingFeedback")} value={loading ? "—" : stats?.pendingFeedback ?? 0} tone="accent" icon={Inbox} />
        <StatCard label={t("activeEmployees")} value={loading ? "—" : stats?.activeEmployees ?? 0} icon={UserCog} />
      </div>

      <div className="card p-5">
        <h2 className="font-display text-sm font-semibold text-ink mb-1">{t("liveActivity")}</h2>
        <p className="text-xs text-ink-muted mb-3">{t("streamingIn")}</p>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : data?.recent?.length ? (
          <LiveActivityFeed entries={data.recent} />
        ) : (
          <EmptyState title={t("noActivityAtAll")} hint={t("willShowUpHere")} />
        )}
      </div>
    </div>
  );
}
