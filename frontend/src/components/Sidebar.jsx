import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardEdit,
  Search,
  Landmark,
  Users,
  Inbox,
  FileCheck2,
  ShieldCheck,
  UploadCloud,
  UserCog,
  Settings,
  LogOut,
  Sprout,
  Languages,
  ClipboardList,
  MessageSquarePlus,
  CheckSquare,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LiveIndicator from "./LiveIndicator";
import { useNotifications } from "../context/NotificationContext";

const EMPLOYEE_NAV = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/activity/new", key: "logActivity", icon: ClipboardEdit },
  {
    to: "/tasks",
    key: "myTasks",
    icon: CheckSquare,
    permission: "viewTasks",
  },
  {
    to: "/grampanchayats",
    key: "grampanchayats",
    icon: Landmark,
    permission: "viewGramPanchayats",
  },
  {
    to: "/contacts",
    key: "contacts",
    icon: Users,
    permission: "viewContacts",
  },
  {
    to: "/suggest-change",
    key: "suggestChange",
    icon: MessageSquarePlus,
    permission: "suggestChanges",
  },
];

const ADMIN_NAV = [
  {
    to: "/admin/dashboard",
    key: "dashboard",
    icon: LayoutDashboard,
    notificationKey: "dashboard",
  },
  {
    to: "/admin/explorer",
    key: "explorer",
    icon: Search,
  },
  {
    to: "/admin/grampanchayats",
    key: "grampanchayats",
    icon: Landmark,
  },
  {
    to: "/admin/contacts",
    key: "contacts",
    icon: Users,
  },
  {
    to: "/admin/feedback",
    key: "feedbackInbox",
    icon: Inbox,
    notificationKey: "feedback",
  },
  {
    to: "/admin/registrations",
    key: "registrations",
    icon: FileCheck2,
    notificationKey: "registrations",
  },
  {
    to: "/admin/approvals",
    key: "approvals",
    icon: ShieldCheck,
    notificationKey: "approvals",
  },
  {
    to: "/admin/tasks",
    key: "tasks",
    icon: ClipboardList,
    notificationKey: "tasks",
  },
  {
    to: "/admin/import",
    key: "bulkImport",
    icon: UploadCloud,
  },
  {
    to: "/admin/employees",
    key: "employees",
    icon: UserCog,
  },
  {
    to: "/admin/settings",
    key: "settings",
    icon: Settings,
  },
];

export function SidebarContent({ onNavigate }) {
  const { user, logout, isAdmin } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const notifications = useNotifications();

  const navItems = (isAdmin ? ADMIN_NAV : EMPLOYEE_NAV).filter(
    ({ permission }) =>
      !permission ||
      isAdmin ||
      user?.permissions?.[permission] !== false
  );

  function handleNavigation() {
    if (typeof onNavigate === "function") {
      onNavigate();
    }
  }

  return (
    <>
      <div className="px-6 pt-6 pb-5 flex items-center gap-2.5 border-b border-white/10">
        <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
          <Sprout
            className="h-5 w-5 text-white"
            strokeWidth={2.25}
          />
        </div>

        <div className="min-w-0">
          <p className="font-display text-base font-semibold text-white leading-tight truncate">
            GramSoft
          </p>

          <p className="text-[11px] text-white/45 leading-tight">
            Operations Console
          </p>
        </div>
      </div>

      <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(
          ({ to, key, icon: Icon, notificationKey }) => {
            const count =
              isAdmin && notificationKey
                ? notifications.sectionCounts[notificationKey] || 0
                : 0;

            return (
              <NavLink
                key={to}
                to={to}
                onClick={handleNavigation}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`
                }
              >
                <Icon
                  className="h-4 w-4 flex-shrink-0"
                  strokeWidth={1.75}
                />

                <span className="min-w-0 flex-1 truncate">
                  {t(key)}
                </span>

                {count > 0 && (
                  <span
                    className="inline-flex min-w-[22px] h-5 px-1.5 rounded-full bg-signal-500 text-white text-[11px] leading-none font-bold items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-white/10"
                    aria-label={`${count} unread notifications`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </NavLink>
            );
          }
        )}
      </nav>

      <div className="px-3 pb-4 space-y-2">
        <button
          type="button"
          onClick={toggleLanguage}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          title={t("language")}
        >
          <span className="flex items-center gap-2">
            <Languages
              className="h-3.5 w-3.5"
              strokeWidth={1.75}
            />
            {t("language")}
          </span>

          <span className="flex rounded-full bg-white/10 p-0.5">
            <span
              className={`px-2 py-0.5 rounded-full transition-colors ${
                language === "en"
                  ? "bg-brand-500 text-white"
                  : "text-white/50"
              }`}
            >
              EN
            </span>

            <span
              className={`px-2 py-0.5 rounded-full transition-colors ${
                language === "mr"
                  ? "bg-brand-500 text-white"
                  : "text-white/50"
              }`}
            >
              मर
            </span>
          </span>
        </button>

        <div className="px-3">
          <LiveIndicator className="text-white/70" />
        </div>

        <div className="flex items-center gap-2.5 px-3 py-3 rounded-lg bg-white/5 min-w-0">
          <div className="h-8 w-8 rounded-full bg-accent-400 text-ink flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {user?.name}
            </p>

            <p className="text-[11px] text-white/45 capitalize truncate">
              {isAdmin ? "Admin" : user?.team || "Employee"}
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            title={t("logOut")}
            className="text-white/45 hover:text-white p-1.5 rounded-md hover:bg-white/10 flex-shrink-0"
          >
            <LogOut
              className="h-4 w-4"
              strokeWidth={1.75}
            />
          </button>
        </div>
      </div>
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:flex-col w-64 flex-shrink-0 bg-ink text-white/90 min-h-screen sticky top-0">
      <SidebarContent />
    </aside>
  );
}
