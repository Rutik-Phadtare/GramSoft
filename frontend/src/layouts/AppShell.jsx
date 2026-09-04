import { useState } from "react";
import { Outlet, useLocation, Link } from "react-router-dom";
import { Menu, X, Sprout, Search, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar, { SidebarContent } from "../components/Sidebar";
import LiveIndicator from "../components/LiveIndicator";
import { useAuth } from "../context/AuthContext";

// Turns "/admin/grampanchayats/123" into ["Admin", "Grampanchayats"] - good
// enough for a lightweight breadcrumb without a route-config table to
// maintain. IDs (long alphanumeric segments) are dropped since they aren't
// meaningful on their own; the page's own PageHeader already gives the
// specific record's name/title.
function useBreadcrumb() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  return segments
    .filter((s) => !/^[a-f0-9]{20,}$/i.test(s))
    .map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}

function DesktopTopbar() {
  const crumbs = useBreadcrumb();
  const { isAdmin } = useAuth();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <header className="hidden lg:flex items-center justify-between px-6 h-14 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-20">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />}
            <span className={`truncate ${i === crumbs.length - 1 ? "text-ink font-semibold" : "text-ink-muted"}`}>{crumb}</span>
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-ink-muted">{today}</span>
        {isAdmin && (
          <Link
            to="/admin/explorer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft border border-line rounded-lg px-2.5 py-1.5 hover:bg-canvas transition-colors"
            title="Search everything"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </Link>
        )}
      </div>
    </header>
  );
}

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-canvas">
      <Sidebar />

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-ink/40 z-40 lg:hidden"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.2 }}
              className="fixed inset-y-0 left-0 w-64 bg-ink text-white/90 z-50 flex flex-col lg:hidden"
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute top-5 right-3 text-white/60 hover:text-white p-1"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 max-w-full flex flex-col">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-line bg-surface sticky top-0 z-30">
          <button onClick={() => setDrawerOpen(true)} className="p-1.5 -ml-1.5 text-ink-soft">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-brand-500 flex items-center justify-center">
              <Sprout className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-display font-semibold text-sm text-ink">GramSoft</span>
          </div>
          <LiveIndicator />
        </header>

        <DesktopTopbar />

        <main className="flex-1 min-w-0 w-full max-w-screen-2xl mx-auto px-4 py-6 sm:px-6 lg:px-8 sm:py-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
