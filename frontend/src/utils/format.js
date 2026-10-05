export function timeAgo(dateInput) {
  const date = new Date(dateInput);
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatDate(dateInput) {
  return new Date(dateInput).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(dateInput) {
  return new Date(dateInput).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function activityTypeLabel(type) {
  return String(type || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function softwareStatusLabel(status) {
  switch (status) {
    case "active":
      return "Active user";
    case "churned":
      return "Previously used";
    case "never_used":
      return "Never used";
    default:
      return "Unknown";
  }
}

export function paymentModeLabel(mode) {
  switch (mode) {
    case "upi":
      return "UPI";
    case "bank_transfer":
      return "Bank transfer";
    case "cash":
      return "Cash";
    case "cheque":
      return "Cheque";
    case "other":
      return "Other";
    default:
      return mode || "—";
  }
}

// Full, unambiguous timestamp (with year and seconds) for audit views.
export function formatExactDateTime(dateInput) {
  if (!dateInput) return "—";
  return new Date(dateInput).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}
