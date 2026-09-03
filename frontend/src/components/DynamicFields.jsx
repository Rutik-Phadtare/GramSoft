// Renders whatever custom questions an admin has configured (Settings ->
// Form Fields) for a form target. `values` is a flat { [fieldKey]: value }
// object that the parent form keeps in state and eventually sends as
// `customFields`. This is the single dynamic-form-rendering engine shared
// across Activity / Feedback / Registration / Gram Panchayat / Contact -
// see requirements doc #36 ("do not create duplicate form systems").
export default function DynamicFields({ fields, values, onChange }) {
  if (!fields?.length) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key] ?? (field.type === "multiselect" ? [] : "");
        const setValue = (v) => onChange(field.key, v);
        const wide = ["textarea", "multiselect", "radio"].includes(field.type);

        return (
          <div key={field.key} className={wide ? "sm:col-span-2" : ""}>
            <label className="field-label">
              {field.label}
              {field.required && <span className="text-signal-500"> *</span>}
            </label>
            {field.helpText && <p className="text-xs text-ink-muted -mt-1 mb-1">{field.helpText}</p>}

            {field.type === "textarea" && (
              <textarea
                className="field-textarea"
                rows={3}
                required={field.required}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "text" && (
              <input
                type="text"
                className="field-input"
                required={field.required}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "email" && (
              <input
                type="email"
                className="field-input"
                required={field.required}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "phone" && (
              <input
                type="tel"
                className="field-input"
                required={field.required}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "number" && (
              <input
                type="number"
                className="field-input"
                required={field.required}
                min={field.validation?.min}
                max={field.validation?.max}
                placeholder={field.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "date" && (
              <input
                type="date"
                className="field-input"
                required={field.required}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "datetime" && (
              <input
                type="datetime-local"
                className="field-input"
                required={field.required}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}

            {field.type === "select" && (
              <select
                className="field-input"
                required={field.required}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Select…</option>
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {field.type === "multiselect" && (
              <div className="flex flex-wrap gap-2">
                {(field.options || []).map((opt) => {
                  const arr = Array.isArray(value) ? value : [];
                  const checked = arr.includes(opt);
                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => setValue(checked ? arr.filter((v) => v !== opt) : [...arr, opt])}
                      className={`btn text-sm border ${
                        checked ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {field.type === "radio" && (
              <div className="flex flex-wrap gap-2">
                {(field.options || []).map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => setValue(opt)}
                    className={`btn text-sm border ${
                      value === opt ? "border-brand-700 bg-brand-700 text-white" : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {(field.type === "boolean" || field.type === "checkbox") && (
              <label className="flex items-center gap-2 text-sm text-ink-soft mt-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-300"
                  checked={Boolean(value)}
                  onChange={(e) => setValue(e.target.checked)}
                />
                Yes
              </label>
            )}

            {field.type === "rating" && (
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setValue(n)}
                    className={`h-8 w-8 rounded-full border text-sm font-medium ${
                      Number(value) >= n ? "border-accent-500 bg-accent-400 text-ink" : "border-line bg-surface text-ink-soft"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}

            {field.type === "file" && (
              <p className="text-xs text-ink-muted italic">
                File upload fields are configured but not yet supported by this form - ask your admin.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
