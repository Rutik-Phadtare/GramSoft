import { DESIGNATIONS, designationMarathi } from "../utils/constants";

// English designation <option>s (canonical stored value, English label only).
export function DesignationOptions() {
  return DESIGNATIONS.map((d) => <option key={d} value={d}>{d}</option>);
}

// Marathi designation <option>s from the same mapping. A legacy/custom stored
// value that isn't in the mapping stays selectable so nothing is lost.
export function DesignationMrOptions({ current }) {
  const labels = DESIGNATIONS.map(designationMarathi);
  return (
    <>
      {current && !labels.includes(current) && <option value={current}>{current}</option>}
      {DESIGNATIONS.map((d) => <option key={d} value={designationMarathi(d)}>{designationMarathi(d)}</option>)}
    </>
  );
}

export default function DesignationMrSelect({ value, onChange, className = "field-input", ...rest }) {
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">—</option>
      <DesignationMrOptions current={value} />
    </select>
  );
}
