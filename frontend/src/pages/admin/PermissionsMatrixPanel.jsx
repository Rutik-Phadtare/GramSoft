import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { employeeApi } from "../../api/employees";
import { apiErrorMessage } from "../../api/client";
import Toggle from "../../components/Toggle";
import Badge from "../../components/Badge";
import EmptyState from "../../components/EmptyState";
import { SkeletonRows } from "../../components/Skeleton";

// The one screen where an admin can see and change what every employee can
// do, at a glance, without drilling into each profile. Every column comes
// from the permission registry (config/permissions.js on the backend) -
// nothing here is hardcoded, so a new permission just appears as a new
// column the next time this loads.
export default function PermissionsMatrixPanel() {
  const [employees, setEmployees] = useState(null);
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState("");
  // Tracks which individual cell is mid-save, keyed "employeeId:permissionKey",
  // so only that one toggle shows a busy state - not the whole table.
  const [pending, setPending] = useState({});

  function load() {
    setError("");
    Promise.all([employeeApi.list(), employeeApi.permissionRegistry()])
      .then(([emp, reg]) => {
        setEmployees(emp.employees.filter((e) => e.role !== "admin"));
        setRegistry(reg.permissions);
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  const groups = useMemo(() => {
    if (!registry) return [];
    const byGroup = {};
    for (const p of registry) (byGroup[p.group] = byGroup[p.group] || []).push(p);
    return Object.entries(byGroup);
  }, [registry]);

  async function toggleCell(employee, key, nextValue) {
    const cellId = `${employee._id}:${key}`;
    setPending((p) => ({ ...p, [cellId]: true }));
    // Optimistic update so the switch responds instantly; rolled back on failure.
    setEmployees((prev) =>
      prev.map((e) => (e._id === employee._id ? { ...e, permissions: { ...e.permissions, [key]: nextValue } } : e))
    );
    try {
      await employeeApi.update(employee._id, { permissions: { [key]: nextValue } });
    } catch (err) {
      setError(apiErrorMessage(err));
      setEmployees((prev) =>
        prev.map((e) => (e._id === employee._id ? { ...e, permissions: { ...e.permissions, [key]: !nextValue } } : e))
      );
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[cellId];
        return next;
      });
    }
  }

  if (!employees || !registry) {
    return <SkeletonRows rows={5} />;
  }

  if (employees.length === 0) {
    return (
      <div className="card">
        <EmptyState title="No employees yet" hint="Add employees from the Employees page, then manage their access here." />
      </div>
    );
  }

  return (
    <div>
      {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2 mb-4">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-4 py-3 font-semibold text-ink sticky left-0 bg-surface">Employee</th>
              {groups.map(([group, items]) => (
                <th key={group} colSpan={items.length} className="px-2 py-2 text-center border-l border-line">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{group}</span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-line">
              <th className="sticky left-0 bg-surface"></th>
              {groups.flatMap(([group, items]) =>
                items.map((p) => (
                  <th key={p.key} className="px-2 py-2 border-l border-line font-medium text-ink-soft text-xs whitespace-nowrap" title={p.hint}>
                    {p.label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee._id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                <td className="px-4 py-3 sticky left-0 bg-surface">
                  <Link to={`/admin/employees/${employee._id}`} className="font-medium text-ink hover:underline">
                    {employee.name}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-ink-muted">{employee.team || "—"}</span>
                    {!employee.active && <Badge tone="signal">Inactive</Badge>}
                  </div>
                </td>
                {groups.flatMap(([, items]) =>
                  items.map((p) => {
                    const cellId = `${employee._id}:${p.key}`;
                    const checked = employee.permissions?.[p.key] !== false;
                    return (
                      <td key={p.key} className="px-2 py-3 border-l border-line text-center">
                        <div className="flex justify-center">
                          <Toggle
                            checked={checked}
                            disabled={!!pending[cellId]}
                            onChange={(val) => toggleCell(employee, p.key, val)}
                            label={`${p.label} for ${employee.name}`}
                          />
                        </div>
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted mt-3">
        Changes save instantly, per toggle. For change-approval or activity-log details on a specific employee, open their profile.
      </p>
    </div>
  );
}
