import { useEffect, useState } from "react";
import {
  Plus, Trash2, Power, Tags, ClipboardList, MessageSquare, FileCheck2, Landmark,
  Pencil, ChevronUp, ChevronDown, Users, ShieldCheck,
} from "lucide-react";
import { activityTypeApi } from "../../api/activityTypes";
import { formFieldApi } from "../../api/formFields";
import { apiErrorMessage } from "../../api/client";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import Badge from "../../components/Badge";
import Modal from "../../components/Modal";
import PermissionsMatrixPanel from "./PermissionsMatrixPanel";

// The full set of field types the backend actually enforces - see
// backend/src/models/FormFieldConfig.js#FIELD_TYPES and
// backend/src/utils/dynamicFields.js#validateDynamicFieldValues. Keep these
// two lists in sync if a new type is ever added.
const FIELD_TYPES = [
  "text", "textarea", "number", "email", "phone", "date", "datetime",
  "select", "multiselect", "radio", "checkbox", "boolean", "rating", "file",
];
const OPTIONS_TYPES = ["select", "multiselect", "radio"];

export default function AdminSettings() {
  const { t } = useLanguage();
  const SECTIONS = [
    { key: "permissions", label: "Employee Permissions", icon: ShieldCheck, description: "See and change what every employee can access, all at once. Changes apply instantly." },
    { key: "activity_types", label: t("activityTypesLabel"), icon: Tags, description: "Create call/visit categories (Demo, Service, etc.) and decide exactly what an employee fills in for each one." },
    { key: "feedback_fields", label: t("feedbackFieldsLabel"), icon: MessageSquare, description: "Questions shown on the public feedback/publicity form." },
    { key: "registration_fields", label: t("registrationFieldsLabel"), icon: FileCheck2, description: "Questions shown on the public Grampanchayat registration form." },
    { key: "grampanchayat_fields", label: "Grampanchayat profile fields", icon: Landmark, description: "Fields shown (and editable) on every Grampanchayat's own profile page." },
  ];
  const [section, setSection] = useState("permissions");
  const active = SECTIONS.find((s) => s.key === section);

  return (
    <div>
      <PageHeader eyebrow={t("configuration")} title={t("settingsTitle")} description={t("settingsDesc")} />

      <div className="grid gap-6 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)]">
        <nav className="space-y-1">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                section === key ? "bg-ink text-white" : "text-ink-soft hover:bg-ink/5"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold text-ink">{active.label}</h2>
            <p className="text-sm text-ink-muted">{active.description}</p>
          </div>
          {section === "permissions" && <PermissionsMatrixPanel />}
          {section === "activity_types" && <ActivityTypesPanel t={t} />}
          {section === "feedback_fields" && <FlatFormFieldsPanel target="feedback" t={t} />}
          {section === "registration_fields" && <FlatFormFieldsPanel target="registration" t={t} />}
          {section === "grampanchayat_fields" && <FlatFormFieldsPanel target="gramPanchayat" t={t} />}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Activity Types: create/edit/disable/delete the categories themselves,
// control whether Gram Panchayat / Contact show at all for a given
// category, and manage the admin-defined fields scoped to it (or shared
// across all of them, under "Common to every type").
// ─────────────────────────────────────────────────────────────────────────

function ActivityTypesPanel({ t }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("__common__");
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    return activityTypeApi.listForAdmin().then((data) => {
      setTypes(data.types);
      setLoading(false);
      return data.types;
    });
  }
  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    if (!createLabel.trim()) return;
    setCreating(true);
    try {
      const { type } = await activityTypeApi.create({ label: createLabel.trim() });
      setCreateLabel("");
      setCreateOpen(false);
      await refresh();
      setSelectedKey(type.key);
    } catch (err) {
      setCreateError(apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const selectedType = types.find((ty) => ty.key === selectedKey);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,240px)_minmax(0,1fr)] items-start">
      <div className="card p-3">
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("activityTypesLabel")}</span>
          <button onClick={() => setCreateOpen(true)} className="p-1 rounded hover:bg-canvas text-ink-muted" title={t("addType")}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={() => setSelectedKey("__common__")}
          className={`w-full text-left px-2.5 py-2 rounded-md text-sm mb-1 ${
            selectedKey === "__common__" ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas"
          }`}
        >
          Common to every type
        </button>

        {loading ? (
          <p className="text-xs text-ink-muted px-2.5 py-2">{t("loading")}</p>
        ) : (
          <div className="space-y-0.5">
            {types.map((ty) => (
              <button
                key={ty._id}
                onClick={() => setSelectedKey(ty.key)}
                className={`w-full text-left px-2.5 py-2 rounded-md text-sm flex items-center justify-between gap-2 ${
                  selectedKey === ty.key ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas"
                }`}
              >
                <span className="truncate">{ty.label}</span>
                {!ty.active && <Badge tone="outline">off</Badge>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-w-0">
        {selectedKey === "__common__" ? (
          <div className="space-y-4">
            <p className="text-xs text-ink-muted -mt-1">
              These fields appear for <span className="font-medium text-ink-soft">every</span> activity type, in addition to whatever
              is configured specifically for the selected type.
            </p>
            <ActivityFieldsEditor scopeKey={null} t={t} />
          </div>
        ) : selectedType ? (
          <TypeDetailPanel type={selectedType} onChanged={refresh} t={t} />
        ) : (
          <p className="text-sm text-ink-muted">{t("loading")}</p>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("addType")} maxWidth="max-w-sm">
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{createError}</div>}
          <div>
            <label className="field-label">{t("fieldLabel")}</label>
            <input className="field-input" value={createLabel} onChange={(e) => setCreateLabel(e.target.value)} placeholder="e.g. Renewal call" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={creating} className="btn btn-primary">{creating ? t("saving") : t("save")}</button>
            <button type="button" onClick={() => setCreateOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function TypeDetailPanel({ type, onChanged, t }) {
  const [label, setLabel] = useState(type.label);
  const [savingLabel, setSavingLabel] = useState(false);

  useEffect(() => setLabel(type.label), [type._id, type.label]);

  async function saveLabel() {
    if (!label.trim() || label === type.label) return;
    setSavingLabel(true);
    try {
      await activityTypeApi.update(type._id, { label: label.trim() });
      onChanged();
    } finally {
      setSavingLabel(false);
    }
  }

  async function toggleFlag(key, value) {
    await activityTypeApi.update(type._id, { [key]: value });
    onChanged();
  }

  async function toggleActive() {
    await activityTypeApi.update(type._id, { active: !type.active });
    onChanged();
  }

  async function remove() {
    if (!window.confirm(`Remove "${type.label}"? Past entries keep this label; it just stops being offered going forward.`)) return;
    await activityTypeApi.remove(type._id);
    onChanged();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="field-label">{t("fieldLabel")}</label>
            <input className="field-input" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel} />
          </div>
          <button onClick={toggleActive} className="btn btn-outline text-sm py-2">
            <Power className="h-3.5 w-3.5" /> {type.active ? "Disable" : "Enable"}
          </button>
          <button onClick={remove} className="btn btn-outline text-sm py-2 text-signal-600 border-signal-200 hover:bg-signal-50">
            <Trash2 className="h-3.5 w-3.5" /> {t("remove") || "Remove"}
          </button>
        </div>

        <div className="border-t border-line pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Gram Panchayat &amp; Contact
          </p>
          <p className="text-xs text-ink-muted mb-3">
            These are relationships, not free-text questions, so they're controlled here rather than as a custom field. Contact can't be
            shown while Gram Panchayat is hidden — the contact list is filtered by the selected Gram Panchayat.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Show Gram Panchayat"
              checked={type.showGramPanchayat}
              onChange={(v) => toggleFlag("showGramPanchayat", v)}
            />
            <ToggleRow
              label="Require Gram Panchayat"
              checked={type.requireGramPanchayat}
              disabled={!type.showGramPanchayat}
              onChange={(v) => toggleFlag("requireGramPanchayat", v)}
            />
            <ToggleRow
              label="Show Contact"
              checked={type.showContact}
              disabled={!type.showGramPanchayat}
              onChange={(v) => toggleFlag("showContact", v)}
            />
            <ToggleRow
              label="Require Contact"
              checked={type.requireContact}
              disabled={!type.showGramPanchayat || !type.showContact}
              onChange={(v) => toggleFlag("requireContact", v)}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-ink mb-2">Fields just for "{type.label}"</p>
        <ActivityFieldsEditor scopeKey={type.key} t={t} />
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm ${disabled ? "opacity-50" : ""}`}>
      <span className="text-ink-soft">{label}</span>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-300"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

// Fetches the FULL admin field list for target=activity once, then filters
// to just the requested scope client-side - simpler and less error-prone
// than trying to get the public merge-by-type endpoint to also express
// "only this scope, not the merged view" (see formFieldController#listFormFieldsForAdmin).
function ActivityFieldsEditor({ scopeKey, t }) {
  const [allFields, setAllFields] = useState([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    return formFieldApi
      .listForAdmin("activity")
      .then((data) => setAllFields(data.fields))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, []);

  const fields = allFields
    .filter((f) => (f.activityTypeKey || null) === scopeKey)
    .sort((a, b) => a.order - b.order);

  return (
    <FieldListEditor
      fields={fields}
      loading={loading}
      t={t}
      onCreate={(payload) => formFieldApi.create({ ...payload, target: "activity", activityTypeKey: scopeKey }).then(refresh)}
      onUpdate={(id, payload) => formFieldApi.update(id, payload).then(refresh)}
      onDelete={(id) => formFieldApi.remove(id).then(refresh)}
      onReorder={(order) => formFieldApi.reorder("activity", scopeKey, order).then(refresh)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Feedback / Registration / Grampanchayat: no per-category scoping, so this
// is the simple flat case - one field list per target.
// ─────────────────────────────────────────────────────────────────────────

function FlatFormFieldsPanel({ target, t }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    return formFieldApi
      .listForAdmin(target)
      .then((data) => setFields(data.fields.slice().sort((a, b) => a.order - b.order)))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    refresh();
  }, [target]);

  return (
    <FieldListEditor
      fields={fields}
      loading={loading}
      t={t}
      onCreate={(payload) => formFieldApi.create({ ...payload, target }).then(refresh)}
      onUpdate={(id, payload) => formFieldApi.update(id, payload).then(refresh)}
      onDelete={(id) => formFieldApi.remove(id).then(refresh)}
      onReorder={(order) => formFieldApi.reorder(target, null, order).then(refresh)}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared field CRUD list + add/edit modal, used by both the per-type
// Activity Field editor and the flat Feedback/Registration/Grampanchayat
// editors - this is the one form-builder engine described in the
// requirements doc (#36 - don't build parallel field systems).
// ─────────────────────────────────────────────────────────────────────────

const emptyFieldForm = { key: "", label: "", type: "text", options: "", required: false, placeholder: "", helpText: "" };

function FieldListEditor({ fields, loading, onCreate, onUpdate, onDelete, onReorder, t }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null); // null = creating
  const [form, setForm] = useState(emptyFieldForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openCreate() {
    setEditingField(null);
    setForm(emptyFieldForm);
    setError("");
    setModalOpen(true);
  }

  function openEdit(field) {
    setEditingField(field);
    setForm({
      key: field.key,
      label: field.label,
      type: field.type,
      options: (field.options || []).join(", "),
      required: Boolean(field.required),
      placeholder: field.placeholder || "",
      helpText: field.helpText || "",
    });
    setError("");
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.label.trim() || (!editingField && !form.key.trim())) {
      setError("Key and label are required.");
      return;
    }
    const payload = {
      label: form.label.trim(),
      type: form.type,
      required: form.required,
      placeholder: form.placeholder.trim() || undefined,
      helpText: form.helpText.trim() || undefined,
      options: OPTIONS_TYPES.includes(form.type)
        ? form.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined,
    };
    setSubmitting(true);
    try {
      if (editingField) {
        await onUpdate(editingField._id, payload);
      } else {
        await onCreate({ ...payload, key: form.key.trim() });
      }
      setModalOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(field) {
    await onUpdate(field._id, { active: !field.active });
  }

  async function remove(field) {
    if (!window.confirm(`Remove "${field.label}"? Already-saved answers stay on their records.`)) return;
    await onDelete(field._id);
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const reordered = fields.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    onReorder(reordered.map((f, i) => ({ id: f._id, order: i })));
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-end px-5 pt-5">
        <button onClick={openCreate} className="btn btn-outline text-sm py-1.5">
          <Plus className="h-3.5 w-3.5" /> {t("addField")}
        </button>
      </div>
      <div className="pt-3">
        {loading ? (
          <p className="text-sm text-ink-muted p-5">{t("loading")}</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-ink-muted p-5">{t("noCustomFieldsYet")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {fields.map((f, i) => (
              <li key={f._id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex flex-col -my-1 mr-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-muted disabled:opacity-30 hover:text-ink-soft">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="text-ink-muted disabled:opacity-30 hover:text-ink-soft">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className={`text-sm font-medium truncate ${f.active ? "text-ink" : "text-ink-muted line-through"}`}>{f.label}</span>
                  <Badge tone="outline">{f.type}</Badge>
                  {f.required && <Badge tone="signal">{t("required")}</Badge>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded-md hover:bg-canvas text-ink-muted" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleActive(f)} className="p-1.5 rounded-md hover:bg-canvas text-ink-muted" title={f.active ? "Disable" : "Enable"}>
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(f)} className="p-1.5 rounded-md hover:bg-signal-50 text-ink-muted hover:text-signal-600" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingField ? "Edit field" : t("addField")} maxWidth="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}
          {!editingField && (
            <div>
              <label className="field-label">{t("fieldKey")}</label>
              <input className="field-input" value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} placeholder="e.g. internet_available" />
            </div>
          )}
          <div>
            <label className="field-label">{t("fieldLabel")}</label>
            <input className="field-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Is internet available?" />
          </div>
          <div>
            <label className="field-label">{t("fieldType")}</label>
            <select className="field-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
            </select>
          </div>
          {OPTIONS_TYPES.includes(form.type) && (
            <div>
              <label className="field-label">{t("fieldOptions")}</label>
              <input className="field-input" value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} placeholder="e.g. Yes, No, Sometimes" />
            </div>
          )}
          <div>
            <label className="field-label">Placeholder (optional)</label>
            <input className="field-input" value={form.placeholder} onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Help text (optional)</label>
            <input className="field-input" value={form.helpText} onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-brand-700 focus:ring-brand-300"
              checked={form.required}
              onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
            />
            {t("required")}
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? t("saving") : t("save")}</button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn btn-ghost">{t("cancel")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
