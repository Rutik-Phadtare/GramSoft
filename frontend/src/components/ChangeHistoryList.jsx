import { History } from "lucide-react";
import EmptyState from "./EmptyState";
import { formatDateTime } from "../utils/format";

const FIELD_LABELS = {
  name: "Name", nameMr: "Name (Marathi)", designation: "Designation", phone: "Phone",
  email: "Email", address: "Address", addressMr: "Address (Marathi)", district: "District",
  notes: "Notes", taluka: "Taluka",
};

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

const SOURCE_LABEL = {
  direct: "Direct edit",
  approved_request: "Approved change request",
  merge: "Merged from a form",
};

// Renders a ChangeHistory list (from GET /api/persons/:id/history or
// /api/grampanchayats/:id/history) as a simple old → new timeline.
export default function ChangeHistoryList({ history }) {
  if (!history?.length) {
    return <EmptyState title="No changes recorded yet" hint="Every edit to this record will show up here." />;
  }

  return (
    <ul className="divide-y divide-line">
      {history.map((entry) => (
        <li key={entry._id} className="py-3">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <History className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
            <span className="text-sm font-medium text-ink">{FIELD_LABELS[entry.field] || entry.field}</span>
            <span className="text-xs text-ink-muted">{SOURCE_LABEL[entry.source] || entry.source}</span>
            <span className="text-xs text-ink-muted ml-auto">{formatDateTime(entry.createdAt)}</span>
          </div>
          <p className="text-sm text-ink-soft">
            <span className="line-through text-ink-muted">{displayValue(entry.oldValue)}</span>
            {" → "}
            <span className="font-medium">{displayValue(entry.newValue)}</span>
          </p>
          {entry.changedBy?.name && <p className="text-xs text-ink-muted mt-0.5">by {entry.changedBy.name}</p>}
        </li>
      ))}
    </ul>
  );
}
