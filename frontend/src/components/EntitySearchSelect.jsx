import { useEffect, useRef, useState } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

/**
 * A type-ahead combobox: types a name, sees matching results from
 * `fetchResults(query)`, picks one. Used for the Grampanchayat and Person
 * pickers on the activity-logging form and admin filters, so the search
 * behavior (and its "nothing found" messaging) stays consistent everywhere
 * it's used instead of being re-implemented per page.
 */
export default function EntitySearchSelect({
  label,
  placeholder = "Type to search…",
  fetchResults,
  renderOption,
  renderSelected,
  value,
  onChange,
  emptyHint,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 250);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchResults(debouncedQuery)
      .then((results) => !cancelled && setOptions(results))
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, fetchResults]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (value) {
    return (
      <div>
        {label && <label className="field-label">{label}</label>}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
          <div className="min-w-0">{renderSelected(value)}</div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-ink-muted hover:text-ink-soft flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="field-label">{label}</label>}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
        <input
          className="field-input pl-9 pr-8"
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-lift">
          {loading && <div className="px-3 py-2.5 text-sm text-ink-muted">Searching…</div>}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2.5 text-sm text-ink-muted">{emptyHint || "No matches found."}</div>
          )}
          {!loading &&
            options.map((option) => (
              <button
                type="button"
                key={option._id}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-canvas transition-colors"
              >
                {renderOption(option)}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
