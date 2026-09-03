// Shared helpers for the config-driven form system (FormFieldConfig).
// Used by activityController / feedbackController / registrationController
// / gramPanchayatController / personController so validation of
// admin-defined fields lives in one place instead of being re-implemented
// (and re-forgotten) per controller. React-side validation is a UX nicety;
// this is the enforcement that actually matters.

const SLUG_RE = /^[a-z][a-z0-9_]*$/;

// System-reserved keys that must never collide with an admin-created
// dynamic field key, on any target. These are the columns/relationships
// the application manages itself (see requirements doc section 5).
const RESERVED_KEYS = new Set([
  "_id", "id", "employeeId", "userId", "gramPanchayatId", "personId", "contactId",
  "formId", "submissionId", "createdAt", "updatedAt", "customFields",
  "status", "date", "type", "activityTypeKey", "target",
]);

function slugify(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isReservedKey(key) {
  return RESERVED_KEYS.has(key);
}

function isValidSlug(key) {
  return SLUG_RE.test(key || "");
}

// Validates + sanitizes a flat { key: value } bag of dynamic values against
// an array of active FormFieldConfig docs. Returns { errors, values } -
// `values` only contains keys that are actually defined by `fields`
// (unknown keys are dropped, not silently trusted from the client), coerced
// to a sane type per field.type.
function validateDynamicFieldValues(fields, rawValues) {
  const errors = [];
  const values = {};
  const input = rawValues && typeof rawValues === "object" ? rawValues : {};

  for (const field of fields) {
    if (!field.active) continue; // disabled fields are never required or accepted going forward
    const raw = input[field.key];
    const isEmpty =
      raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);

    if (isEmpty) {
      if (field.required) errors.push(`${field.label} is required`);
      else if (field.defaultValue !== undefined && field.defaultValue !== null) values[field.key] = field.defaultValue;
      continue;
    }

    switch (field.type) {
      case "number":
      case "rating": {
        const num = Number(raw);
        if (Number.isNaN(num)) {
          errors.push(`${field.label} must be a number`);
          break;
        }
        if (field.type === "rating" && (num < 1 || num > 5)) {
          errors.push(`${field.label} must be between 1 and 5`);
          break;
        }
        if (field.validation?.min !== undefined && num < field.validation.min) {
          errors.push(`${field.label} must be at least ${field.validation.min}`);
          break;
        }
        if (field.validation?.max !== undefined && num > field.validation.max) {
          errors.push(`${field.label} must be at most ${field.validation.max}`);
          break;
        }
        values[field.key] = num;
        break;
      }
      case "boolean":
      case "checkbox": {
        values[field.key] = raw === true || raw === "true" || raw === "on" || raw === 1;
        break;
      }
      case "select":
      case "radio": {
        const opts = field.options || [];
        if (opts.length && !opts.includes(String(raw))) {
          errors.push(`${field.label} must be one of the configured options`);
          break;
        }
        values[field.key] = String(raw);
        break;
      }
      case "multiselect": {
        const arr = Array.isArray(raw) ? raw : [raw];
        const opts = field.options || [];
        const invalid = opts.length ? arr.filter((v) => !opts.includes(String(v))) : [];
        if (invalid.length) {
          errors.push(`${field.label} has an option that isn't configured`);
          break;
        }
        values[field.key] = arr.map(String);
        break;
      }
      case "date":
      case "datetime": {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          errors.push(`${field.label} must be a valid date`);
          break;
        }
        values[field.key] = d.toISOString();
        break;
      }
      case "email":
      case "phone":
      case "text":
      case "textarea":
      default: {
        const str = String(raw);
        if (field.validation?.minLength !== undefined && str.length < field.validation.minLength) {
          errors.push(`${field.label} is too short`);
          break;
        }
        if (field.validation?.maxLength !== undefined && str.length > field.validation.maxLength) {
          errors.push(`${field.label} is too long`);
          break;
        }
        if (field.validation?.pattern) {
          try {
            const re = new RegExp(field.validation.pattern);
            if (!re.test(str)) {
              errors.push(`${field.label} is not in the expected format`);
              break;
            }
          } catch {
            // A malformed admin-entered pattern shouldn't 500 every submission.
          }
        }
        values[field.key] = str;
        break;
      }
    }
  }

  return { errors, values };
}

module.exports = { slugify, isReservedKey, isValidSlug, validateDynamicFieldValues, RESERVED_KEYS };
