export default function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="min-w-0 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl font-semibold text-ink break-words">{title}</h1>
        {description && <p className="text-sm text-ink-muted mt-1 max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
