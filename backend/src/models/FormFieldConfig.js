const { Schema, model, models } = require("mongoose");

// target: which form this question belongs to.
// key: slug - the property name under customFields on the saved record.
// active: hidden fields stay in the schema/data but stop being asked
//         (existing submissions keep whatever value they already saved
//         under this key - see backend/src/utils/dynamicFields.js).
//
// activityTypeKey: ONLY meaningful when target === "activity". null means
// the field is a "global" activity question, shown regardless of which
// Activity Type the employee picked. A non-null value scopes the field to
// just that one Activity Type (e.g. "Problem & Resolution" only appears
// for the "service" type). This is what makes different Activity Types
// show genuinely different fields instead of one shared field set - see
// backend/src/controllers/formFieldController.js `listFormFields`.
const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "date",
  "datetime",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "boolean",
  "rating",
  "file",
];

const FormFieldConfigSchema = new Schema(
  {
    target: { type: String, enum: ["feedback", "activity", "registration", "gramPanchayat", "contact"], required: true },
    activityTypeKey: { type: String, default: null, trim: true }, // only used when target === "activity"
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: FIELD_TYPES, required: true },
    options: [{ type: String, trim: true }], // used by select / multiselect / radio
    required: { type: Boolean, default: false },
    placeholder: { type: String, trim: true },
    helpText: { type: String, trim: true },
    defaultValue: { type: Schema.Types.Mixed },
    // Lightweight validation knobs the backend actually enforces - see
    // utils/dynamicFields.js#validateDynamicFieldValues. Keep this small
    // and generic rather than a bespoke rule engine.
    validation: {
      min: { type: Number },
      max: { type: Number },
      minLength: { type: Number },
      maxLength: { type: Number },
      pattern: { type: String, trim: true }, // regex, applied to text/textarea/email/phone
    },
    // Reserved for future conditional-field support (see spec #28):
    // { fieldKey, equals } - only render/require this field when another
    // field on the same form currently holds this value. Not yet enforced
    // on the backend; the frontend form builder/renderer can start using
    // it without a schema change later.
    visibleWhen: {
      fieldKey: { type: String, trim: true },
      equals: { type: Schema.Types.Mixed },
    },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

// A key must be unique within its scope: same target, same activityTypeKey
// (both non-activity targets and "global" activity fields use
// activityTypeKey: null, so this still enforces uniqueness for them).
FormFieldConfigSchema.index({ target: 1, activityTypeKey: 1, key: 1 }, { unique: true });
FormFieldConfigSchema.index({ target: 1, activityTypeKey: 1, active: 1, order: 1 });

const FormFieldConfigModel = models.FormFieldConfig || model("FormFieldConfig", FormFieldConfigSchema);
FormFieldConfigModel.FIELD_TYPES = FIELD_TYPES;

module.exports = FormFieldConfigModel;
