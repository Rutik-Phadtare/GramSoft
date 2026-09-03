import { Plus, Trash2 } from "lucide-react";

// Renders one of the three rate tables from the client's paper form
// (tax rates, construction rates, land ready-reckoner rates) as an
// editable grid. `columns` controls which numeric fields show, since tax
// rates have three (min/max/panchayat-decided) while construction and land
// rates only have one (rate per sq.m.).
export default function RateTableEditor({ rows, onChange, columns, editable = true }) {
  function updateRow(index, field, value) {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: value === "" ? undefined : Number(value) } : row));
    onChange(next);
  }
  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...rows, { labelEn: "", labelMr: "" }]);
  }
  function updateLabel(index, field, value) {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-muted border-b border-line">
            <th className="py-2 pr-3">English</th>
            <th className="py-2 pr-3">मराठी</th>
            {columns.map((col) => (
              <th key={col.key} className="py-2 pr-3">{col.label}</th>
            ))}
            {editable && <th className="py-2 w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="py-1.5 pr-3">
                {editable ? (
                  <input className="field-input py-1.5 text-sm" value={row.labelEn || ""} onChange={(e) => updateLabel(i, "labelEn", e.target.value)} />
                ) : (
                  <span className="text-ink-soft">{row.labelEn}</span>
                )}
              </td>
              <td className="py-1.5 pr-3">
                {editable ? (
                  <input className="field-input py-1.5 text-sm" value={row.labelMr || ""} onChange={(e) => updateLabel(i, "labelMr", e.target.value)} />
                ) : (
                  <span className="text-ink-soft">{row.labelMr}</span>
                )}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="py-1.5 pr-3">
                  {editable ? (
                    <input
                      type="number"
                      className="field-input py-1.5 text-sm w-28"
                      value={row[col.key] ?? ""}
                      onChange={(e) => updateRow(i, col.key, e.target.value)}
                    />
                  ) : (
                    <span className="text-ink-soft">{row[col.key] ?? "—"}</span>
                  )}
                </td>
              ))}
              {editable && (
                <td className="py-1.5">
                  <button type="button" onClick={() => removeRow(i)} className="p-1 rounded-md text-ink-muted hover:text-signal-600 hover:bg-signal-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <button type="button" onClick={addRow} className="btn btn-ghost text-xs py-1.5 mt-2">
          <Plus className="h-3 w-3" /> Add row
        </button>
      )}
    </div>
  );
}
