import { Plus, Trash2 } from "lucide-react";
import { DesignationOptions } from "./DesignationSelect";
import DesignationMrSelect from "./DesignationSelect";
import { applyDesignationChange } from "../utils/constants";

export const EMPTY_CONTACT = { name: "", nameMr: "", designation: "Talathi", designationMr: "तलाठी", phone: "", email: "" };

// Optional list of contacts submitted together with a new Grampanchayat.
// Controlled: `value` is the array of pending contacts; each is editable and
// removable until the parent submits. Designation pairs English <-> Marathi.
export default function ContactsEditor({ value, onChange, disabled }) {
  const update = (i, patch) => onChange(value.map((c, idx) => (idx === i ? patch : c)));
  const change = (i, field, v) => update(i, field === "designation" || field === "designationMr" ? applyDesignationChange(value[i], field, v) : { ...value[i], [field]: v });
  const input = (i, field, label, type = "text") => (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} disabled={disabled} className="field-input" value={value[i][field] || ""} onChange={(e) => change(i, field, e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-3">
      {value.map((c, i) => (
        <div key={i} className="rounded-xl border border-line p-3 bg-canvas/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-ink-muted">Contact {i + 1}</span>
            <button type="button" disabled={disabled} onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-signal-600 text-xs flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {input(i, "name", "Name (English)")}
            {input(i, "nameMr", "Name (Marathi)")}
            <div><label className="field-label">Designation</label>
              <select disabled={disabled} className="field-input" value={c.designation || ""} onChange={(e) => change(i, "designation", e.target.value)}><DesignationOptions /></select></div>
            <div><label className="field-label">Designation (Marathi)</label>
              <DesignationMrSelect disabled={disabled} value={c.designationMr} onChange={(v) => change(i, "designationMr", v)} /></div>
            {input(i, "phone", "Phone", "tel")}
            {input(i, "email", "Email", "email")}
          </div>
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => onChange([...value, { ...EMPTY_CONTACT }])} className="btn btn-outline text-sm"><Plus className="h-4 w-4" /> Add Contact</button>
    </div>
  );
}
