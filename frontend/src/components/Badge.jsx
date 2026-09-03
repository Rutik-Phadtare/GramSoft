const TONES = {
  neutral: "bg-ink/5 text-ink-soft",
  brand: "bg-brand-100 text-brand-800",
  accent: "bg-accent-100 text-accent-700",
  signal: "bg-signal-50 text-signal-600",
  outline: "bg-transparent text-ink-soft border border-line",
};

export default function Badge({ children, tone = "neutral", className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

// Shared mappings so the same designation/interest/status always renders
// with the same tone everywhere it shows up in the app.
export function designationTone(designation) {
  switch (designation) {
    case "Sarpanch":
      return "accent";
    case "Sachiv":
      return "brand";
    case "Gramsevak":
      return "brand";
    case "Talathi":
      return "neutral";
    case "Computer Operator":
      return "signal";
    default:
      return "outline";
  }
}

export function clientInterestTone(interest) {
  switch (interest) {
    case "interested":
      return "brand";
    case "not_interested":
      return "signal";
    case "needs_follow_up":
      return "accent";
    default:
      return "neutral";
  }
}

export function feedbackStatusTone(status) {
  switch (status) {
    case "new":
      return "accent";
    case "reviewed":
      return "brand";
    case "merged":
      return "outline";
    default:
      return "neutral";
  }
}

export function softwareStatusTone(status) {
  switch (status) {
    case "active":
      return "brand";
    case "churned":
      return "signal";
    case "never_used":
    default:
      return "outline";
  }
}
