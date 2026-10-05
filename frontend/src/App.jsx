import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./layouts/AppShell";

// Login is the very first thing an unauthenticated visitor needs, so it
// stays in the main bundle. Every other route is code-split with
// React.lazy - a given user only ever downloads the JS for the pages they
// actually visit (an employee never pays for the admin bundle and vice
// versa), which keeps first paint fast as the app grows.
import Login from "./pages/Login";

const PublicFeedback = lazy(() => import("./pages/PublicFeedback"));
const PublicRegistration = lazy(() => import("./pages/PublicRegistration"));

const EmployeeDashboard = lazy(() => import("./pages/employee/EmployeeDashboard"));
const EmployeeTasks = lazy(() => import("./pages/employee/EmployeeTasks"));
const ActivityNew = lazy(() => import("./pages/employee/ActivityNew"));
const EmployeeGramPanchayats = lazy(() => import("./pages/employee/EmployeeGramPanchayats"));
const EmployeeGramPanchayatDetail = lazy(() => import("./pages/employee/EmployeeGramPanchayatDetail"));
const EmployeeContacts = lazy(() => import("./pages/employee/EmployeeContacts"));
const EmployeeChangeSuggestion = lazy(() => import("./pages/employee/EmployeeChangeSuggestion"));

const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminExplorer = lazy(() => import("./pages/admin/AdminExplorer"));
const AdminGramPanchayats = lazy(() => import("./pages/admin/AdminGramPanchayats"));
const AdminGramPanchayatDetail = lazy(() => import("./pages/admin/AdminGramPanchayatDetail"));
const AdminContacts = lazy(() => import("./pages/admin/AdminContacts"));
const AdminContactDetail = lazy(() => import("./pages/admin/AdminContactDetail"));
const AdminFeedback = lazy(() => import("./pages/admin/AdminFeedback"));
const AdminRegistrations = lazy(() => import("./pages/admin/AdminRegistrations"));
const AdminApprovals = lazy(() => import("./pages/admin/AdminApprovals"));
const AdminImport = lazy(() => import("./pages/admin/AdminImport"));
const AdminEmployees = lazy(() => import("./pages/admin/AdminEmployees"));
const AdminEmployeeDetail = lazy(() => import("./pages/admin/AdminEmployeeDetail"));
const AdminTasks = lazy(() => import("./pages/admin/AdminTasks"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));

function RootRedirect() {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={isAdmin ? "/admin/dashboard" : "/dashboard"} replace />;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/feedback" element={<PublicFeedback />} />
        <Route path="/register" element={<PublicRegistration />} />
        <Route path="/" element={<RootRedirect />} />

        <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route path="/dashboard" element={<EmployeeDashboard />} />
          <Route path="/tasks" element={<EmployeeTasks />} />
          <Route path="/activity/new" element={<ActivityNew />} />
          <Route path="/grampanchayats" element={<EmployeeGramPanchayats />} />
          <Route path="/grampanchayats/:id" element={<EmployeeGramPanchayatDetail />} />
          <Route path="/contacts" element={<EmployeeContacts />} />
          <Route path="/suggest-change" element={<EmployeeChangeSuggestion />} />
        </Route>

        <Route element={<ProtectedRoute adminOnly><AppShell /></ProtectedRoute>}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/activity/new" element={<ActivityNew />} />
          <Route path="/admin/explorer" element={<AdminExplorer />} />
          <Route path="/admin/grampanchayats" element={<AdminGramPanchayats />} />
          <Route path="/admin/grampanchayats/:id" element={<AdminGramPanchayatDetail />} />
          <Route path="/admin/contacts" element={<AdminContacts />} />
          <Route path="/admin/contacts/:id" element={<AdminContactDetail />} />
          <Route path="/admin/feedback" element={<AdminFeedback />} />
          <Route path="/admin/registrations" element={<AdminRegistrations />} />
          <Route path="/admin/approvals" element={<AdminApprovals />} />
          <Route path="/admin/import" element={<AdminImport />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/employees/:id" element={<AdminEmployeeDetail />} />
          <Route path="/admin/tasks" element={<AdminTasks />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  );
}
