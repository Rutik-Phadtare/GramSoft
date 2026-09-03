import { useState } from "react";
import { ClipboardList } from "lucide-react";
import Badge, { designationTone, clientInterestTone } from "./Badge";
import Modal from "./Modal";
import { formatDate, formatDateTime, timeAgo, activityTypeLabel } from "../utils/format";

// One activity log entry, rendered as its own card (not a row in a dense
// list) so it reads clearly on its own, with a "View details" affordance
// that opens everything the employee actually submitted - including
// fields the compact card doesn't have room for, and the exact moment it
// was logged (as opposed to the activity's own date, which the employee
// can pick and isn't necessarily "now").
export default function ActivityLogCard({ entry, showEmployee = false, onOpenPerson, onOpenGramPanchayat }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left card p-4 hover:shadow-lift hover:border-brand-200 transition-all"
      >
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <ClipboardList className="h-4 w-4 text-brand-600" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              {showEmployee && entry.employeeId?.name && (
                <span className="text-sm font-semibold text-ink">{entry.employeeId.name}</span>
              )}
              <Badge tone="brand">{activityTypeLabel(entry.type)}</Badge>
              {entry.clientInterest && <Badge tone={clientInterestTone(entry.clientInterest)}>{activityTypeLabel(entry.clientInterest)}</Badge>}
              {entry.personId?.name && (
                <span className="text-xs font-medium text-ink-soft inline-flex items-center gap-1">
                  {entry.personId.name}
                  {entry.designationSnapshot && <Badge tone={designationTone(entry.designationSnapshot)}>{entry.designationSnapshot}</Badge>}
                </span>
              )}
              {entry.gramPanchayatId?.name && <span className="text-xs text-ink-muted">· {entry.gramPanchayatId.name}</span>}
            </div>
            <p className="text-sm text-ink-soft break-words">{entry.notes}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-ink-muted">
              <span>Logged {timeAgo(entry.createdAt || entry.date)}</span>
              {entry.durationMinutes ? <span>· {entry.durationMinutes} min</span> : null}
            </div>
          </div>
        </div>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Activity log details" maxWidth="max-w-lg">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{activityTypeLabel(entry.type)}</Badge>
            {entry.clientInterest && <Badge tone={clientInterestTone(entry.clientInterest)}>{activityTypeLabel(entry.clientInterest)}</Badge>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {entry.employeeId?.name && (
              <Field label="Logged by">{entry.employeeId.name}</Field>
            )}
            <Field label="Activity date">{formatDate(entry.date)}</Field>
            <Field label="Submitted on" full>{formatDateTime(entry.createdAt || entry.date)}</Field>
            {entry.personId?.name && (
              <Field label="Contact">
                {entry.personId.name}{entry.designationSnapshot ? ` (${entry.designationSnapshot})` : ""}
              </Field>
            )}
            {entry.gramPanchayatId?.name && <Field label="Grampanchayat">{entry.gramPanchayatId.name}</Field>}
            {entry.durationMinutes ? <Field label="Duration">{entry.durationMinutes} min</Field> : null}
            {entry.problemSolved && <Field label="Problem solved" full>{entry.problemSolved}</Field>}
            {entry.nextFollowUpDate && <Field label="Next follow-up">{formatDate(entry.nextFollowUpDate)}</Field>}
          </dl>

          <div>
            <p className="field-label">Notes</p>
            <p className="text-sm text-ink-soft whitespace-pre-wrap break-words bg-canvas rounded-lg p-3 mt-1">{entry.notes}</p>
          </div>

          {entry.customFields && Object.keys(entry.customFields).length > 0 && (
            <div className="pt-3 border-t border-line">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Additional answers</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {Object.entries(entry.customFields).map(([key, value]) => (
                  <Field key={key} label={key}>
                    {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                  </Field>
                ))}
              </dl>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-ink font-medium break-words">{children}</dd>
    </div>
  );
}
