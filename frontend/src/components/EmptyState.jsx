export default function EmptyState({ title = "Nothing here yet", hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="h-10 w-10 rounded-full bg-ink/5 flex items-center justify-center mb-1">
        <svg className="h-5 w-5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="text-sm text-ink-muted max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}
