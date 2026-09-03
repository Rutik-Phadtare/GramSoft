export default function StatCard({ label, value, hint, tone = "default", icon: Icon }) {
  return (
    <div className="card p-5 flex flex-col gap-1 transition-shadow hover:shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
        {Icon && (
          <span
            className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              tone === "accent" ? "bg-accent-50 text-accent-500" : "bg-brand-50 text-brand-600"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <span
        className={`font-display text-3xl font-semibold ${
          tone === "accent" ? "text-accent-500" : "text-ink"
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </div>
  );
}
