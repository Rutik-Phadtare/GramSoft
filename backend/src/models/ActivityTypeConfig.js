const { Schema, model, models } = require("mongoose");

const ActivityTypeConfigSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, unique: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    // Gram Panchayat and Contact are real relationships (ActivityLog.
    // gramPanchayatId / personId), not arbitrary business fields - they
    // drive contact-list scoping, CSV export, and GP relationship-status
    // reporting elsewhere in the app, so they aren't part of the generic
    // FormFieldConfig field-CRUD system. Admin still gets full control over
    // whether each is shown/required *per Activity Type*, just through
    // these dedicated flags instead of being deletable like a text field.
    //
    // Contact can never be shown while Gram Panchayat is hidden - the
    // employee's contact list is scoped BY the selected Gram Panchayat, so
    // showing Contact without it would have nothing to filter by. This is
    // enforced in activityTypeController#updateActivityType, not just here.
    showGramPanchayat: { type: Boolean, default: true },
    requireGramPanchayat: { type: Boolean, default: true },
    showContact: { type: Boolean, default: true },
    requireContact: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

const DEFAULT_ACTIVITY_TYPES = [
  { key: "sales_call", label: "Sales call" },
  { key: "promotional_call", label: "Promotional call" },
  { key: "demo", label: "Demo" },
  { key: "support_call", label: "Support call" },
  { key: "support_visit", label: "Support visit" },
  { key: "follow_up", label: "Follow-up" },
  { key: "other", label: "Other" },
];

const ActivityTypeConfigModel =
  models.ActivityTypeConfig || model("ActivityTypeConfig", ActivityTypeConfigSchema);
ActivityTypeConfigModel.DEFAULT_ACTIVITY_TYPES = DEFAULT_ACTIVITY_TYPES;

module.exports = ActivityTypeConfigModel;
