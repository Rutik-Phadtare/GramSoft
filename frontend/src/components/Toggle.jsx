// Accessible on/off switch used anywhere the admin is flipping a capability
// on or off (permissions, feature flags, etc). A real switch reads as
// "control panel" the way a checkbox doesn't - worth having one shared
// component instead of re-implementing this per page.
export default function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-brand-600" : "bg-ink/15"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? "translate-x-[19px]" : "translate-x-1"
        }`}
      />
    </button>
  );
}
