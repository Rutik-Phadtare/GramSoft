import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { activityApi } from "../../api/activities";
import { activityTypeApi } from "../../api/activityTypes";
import { gramPanchayatApi } from "../../api/gramPanchayats";
import { personApi } from "../../api/persons";
import { formFieldApi } from "../../api/formFields";
import { changeRequestApi } from "../../api/changeRequests";
import { apiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { DESIGNATIONS } from "../../utils/constants";
import { DesignationOptions } from "../../components/DesignationSelect";
import DesignationMrSelect from "../../components/DesignationSelect";
import { applyDesignationChange } from "../../utils/constants";
import { useLanguage } from "../../context/LanguageContext";
import PageHeader from "../../components/PageHeader";
import EntitySearchSelect from "../../components/EntitySearchSelect";
import DynamicFields from "../../components/DynamicFields";
import NewGramPanchayatRequest from "../../components/NewGramPanchayatRequest";
import { nameLine, placeLine, displayName } from "../../utils/i18nData";

// Business fields (what used to be the hard-coded "Problem & Solution" /
// "Their response" blocks, plus duration/follow-up date) are no longer
// decided here by matching the type key against a regex. They come from
// FormFieldConfig, scoped to whichever Activity Type is selected - see
// backend/src/controllers/formFieldController.js#listFormFields and the
// migration in backend/src/seed/migrateActivityFieldsToConfig.js that
// seeded the equivalent fields for existing installs. An Admin can now add,
// remove, or add entirely new fields per Activity Type without touching
// this file.

const emptyForm = { type: "", notes: "" };

// "Name | Phone | Designation" - the one-line form a registered contact is
// shown in when picking who was contacted.
function contactOptionLabel(p, language) {
  return [displayName(p, language).primary, p.phone || "No phone", p.designation].filter(Boolean).join(" | ");
}
const emptyContactDetails = { name: "", nameMr: "", phone: "", address: "", addressMr: "", designation: "", designationMr: "" };

export default function ActivityNew() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { t, language } = useLanguage();
  const [types, setTypes] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [gramPanchayat, setGramPanchayat] = useState(null);
  const [person, setPerson] = useState(null);
  const [customValues, setCustomValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  // Optional, collapsed by default - only engaged when the employee wants
  // to confirm or correct a contact's bio-data (name/address/designation in
  // both languages). Whatever's filled in here never writes to the
  // directory directly - it goes to an admin's approval queue instead.
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);
  const [newGpOpen, setNewGpOpen] = useState(false);
  const [contactDetails, setContactDetails] = useState(emptyContactDetails);

  useEffect(() => {
    activityTypeApi.list().then((data) => {
      setTypes(data.types);
      if (data.types.length) setForm((f) => ({ ...f, type: f.type || data.types[0].key }));
    });
  }, []);

  // The selected type's own config decides whether Gram Panchayat / Contact
  // even appear, and whether they're required - see ActivityTypeConfig and
  // activityTypeController#updateActivityType for the cascade rule (Contact
  // can never show while Gram Panchayat is hidden).
  const selectedType = types.find((ty) => ty.key === form.type);
  const showGramPanchayat = selectedType ? selectedType.showGramPanchayat : true;
  const requireGramPanchayat = selectedType ? selectedType.requireGramPanchayat : true;
  const showContact = selectedType ? selectedType.showGramPanchayat && selectedType.showContact : true;
  const requireContact = selectedType ? selectedType.requireContact : false;

  // If the newly selected type hides Gram Panchayat/Contact, clear
  // whatever was picked - it would otherwise be silently dropped on submit
  // anyway (see backend activityController#createActivity), which would be
  // confusing without also clearing it from view.
  useEffect(() => {
    if (!showGramPanchayat) {
      setGramPanchayat(null);
      setPerson(null);
    } else if (!showContact) {
      setPerson(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGramPanchayat, showContact]);

  // Reload the dynamic field set every time the selected Activity Type
  // changes - a Marketing entry and a Service entry can ask entirely
  // different questions. Previously-entered dynamic values for fields that
  // no longer apply are cleared so a stray value can't be silently
  // submitted under the wrong type.
  useEffect(() => {
    if (!form.type) {
      setCustomFieldDefs([]);
      return;
    }
    let cancelled = false;
    setFieldsLoading(true);
    formFieldApi
      .list("activity", form.type)
      .then((data) => {
        if (cancelled) return;
        setCustomFieldDefs(data.fields);
        setCustomValues((prev) => {
          const keep = new Set(data.fields.map((f) => f.key));
          const next = {};
          for (const k of Object.keys(prev)) if (keep.has(k)) next[k] = prev[k];
          return next;
        });
      })
      .finally(() => !cancelled && setFieldsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [form.type]);

  const searchGramPanchayats = useCallback(
    (q) => gramPanchayatApi.list({ q }).then((d) => d.results),
    []
  );
  // Scoped to the selected Grampanchayat - this is the actual enforcement
  // point on the frontend (the backend enforces it too, in personController
  // #listPersons, so a scoped-out contact can never be fetched even by a
  // direct API call). Recreated whenever `gramPanchayat` changes so the
  // EntitySearchSelect re-queries against the new scope.
  const searchPersons = useCallback(
    (q) => (gramPanchayat ? personApi.list({ q, gramPanchayatId: gramPanchayat._id }).then((d) => d.results) : Promise.resolve([])),
    [gramPanchayat]
  );

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectGramPanchayat(gp) {
    setGramPanchayat(gp);
    // Contacts are scoped to a single Grampanchayat - switching (or
    // clearing) it invalidates whatever contact was previously picked, so
    // it can't be silently carried over to the wrong village.
    setPerson(null);
    setContactDetails(emptyContactDetails);
    setContactDetailsOpen(false);
  }

  function selectPerson(p) {
    setPerson(p);
    // Pre-fill from what's already on file, so opening the section shows
    // "here's what we have" rather than a blank form to retype from scratch.
    if (p) {
      setContactDetails({
        name: p.name || "", nameMr: p.nameMr || "", phone: p.phone || "", address: p.address || "",
        addressMr: p.addressMr || "", designation: p.designation || "",
      });
    } else {
      setContactDetails(emptyContactDetails);
    }
  }

  function resetForm() {
    setForm((f) => ({ ...emptyForm, type: f.type }));
    setGramPanchayat(null);
    setPerson(null);
    setCustomValues({});
    setContactDetails(emptyContactDetails);
    setContactDetailsOpen(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.type || !form.notes.trim()) {
      setError("Activity type and notes are required.");
      return;
    }
    if (requireGramPanchayat && !gramPanchayat) {
      setError("Gram Panchayat is required for this activity type.");
      return;
    }
    // A contact is satisfied by EITHER an existing contact picked from the
    // list OR a complete new-contact proposal (name + designation) - the
    // backend enforces the same rule (activityController#createActivity).
    const hasNewContactProposal = !person && contactDetailsOpen && contactDetails.name.trim() && contactDetails.designation;
    if (requireContact && !person && !hasNewContactProposal) {
      setError("Select an existing contact or propose a new contact for this activity type.");
      return;
    }
    const missing = customFieldDefs.filter((f) => f.required && !customValues[f.key]);
    if (missing.length) {
      setError(`${missing.map((f) => f.label).join(", ")} ${missing.length > 1 ? "are" : "is"} required.`);
      return;
    }
    if (contactDetailsOpen && !contactDetails.name.trim()) {
      setError("Contact details are open - add at least a name, or close that section.");
      return;
    }
    if (contactDetailsOpen && !person && !contactDetails.designation) {
      setError("Select a designation for the new contact, or close that section.");
      return;
    }

    setSubmitting(true);
    try {
      const { entry } = await activityApi.create({
        type: form.type,
        gramPanchayatId: gramPanchayat?._id,
        personId: person?._id,
        newContactProposal: hasNewContactProposal ? { ...contactDetails, name: contactDetails.name.trim() } : undefined,
        notes: form.notes.trim(),
        // clientInterest/problemSolved/durationMinutes/nextFollowUpDate are
        // no longer sent as dedicated top-level params from the frontend -
        // they travel inside customFields like any other admin-configured
        // field, and the backend mirrors recognized legacy keys onto their
        // dedicated columns for continuity (see activityController.js).
        customFields: customValues,
      });

      // A contact-detail correction/addition is proposed separately from
      // the activity entry itself - the log always saves immediately;
      // this part just queues up for an admin to approve before it touches
      // the real directory.
      let proposalError = "";
      if (contactDetailsOpen && contactDetails.name.trim()) {
        try {
          await changeRequestApi.create({
            entityType: "Person",
            entityId: person?._id || null,
            proposedChanges: contactDetails,
            reason: "Submitted while logging field activity",
            relatedActivityLogId: entry._id,
            // Only meaningful for a brand-new contact (person is null) - it's
            // what lets the admin's approval actually link them to this
            // Grampanchayat instead of creating an orphan directory entry.
            // Confirming an *existing* contact's details doesn't need it,
            // since that person is already linked here.
            gramPanchayatId: !person && gramPanchayat ? gramPanchayat._id : undefined,
          });
        } catch (err) {
          // The activity itself is already saved - don't invite a re-submit
          // (which would duplicate it); say what actually happened instead.
          proposalError = apiErrorMessage(err);
        }
      }

      resetForm();
      if (proposalError) {
        setError(`Activity saved, but the contact proposal could not be submitted: ${proposalError}`);
      } else {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 3500);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={t("dailyLog")}
        title={t("logFieldActivityTitle")}
        description={t("logFieldActivityDesc")}
      />

      {justSaved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-brand-50 text-brand-700 px-4 py-3 text-sm font-medium animate-slide-in">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {t("entrySaved")}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5 max-w-2xl">
        {error && <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>}

        <div>
          <label className="field-label">{t("activityType")}</label>
          <div className="flex flex-wrap gap-2">
            {types.map((ty) => (
              <button
                type="button"
                key={ty.key}
                onClick={() => update("type", ty.key)}
                className={`btn text-sm border ${
                  form.type === ty.key
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-surface text-ink-soft"
                }`}
              >
                {ty.label}
              </button>
            ))}
          </div>
        </div>

        {showGramPanchayat && (
          <>
            <EntitySearchSelect
              label={`${t("grampanchayat")}${requireGramPanchayat ? " *" : ""}`}
              placeholder={t("searchGpPlaceholder")}
              fetchResults={searchGramPanchayats}
              value={gramPanchayat}
              onChange={selectGramPanchayat}
              emptyHint="No matching Grampanchayat found."
              renderOption={(gp) => (
                <div>
                  <p className="text-sm font-medium text-ink">{nameLine(gp, language)}</p>
                  <p className="text-xs text-ink-muted">{placeLine(gp, language)}</p>
                </div>
              )}
              renderSelected={(gp) => (
                <div>
                  <p className="text-sm font-medium text-ink">{nameLine(gp, language)}</p>
                  <p className="text-xs text-ink-muted">{placeLine(gp, language)}</p>
                </div>
              )}
            />

          <button
            type="button"
            onClick={() => setNewGpOpen(true)}
            className="group relative mt-3 inline-flex max-w-full items-center gap-2 overflow-hidden rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-brand-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-100 hover:text-brand-800 hover:shadow-md active:translate-y-0 sm:px-4 sm:py-2.5"
          >
            {/* Shine effect */}
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

            {/* Plus icon */}
            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm leading-none text-white shadow-sm transition-all duration-300 group-hover:rotate-90 group-hover:scale-110">
              +
            </span>

            {/* Button text */}
            <span className="relative min-w-0 break-words">
              Grampanchayat not listed? Suggest a new one
            </span>

            {/* Arrow */}
            <span className="relative shrink-0 text-brand-500 transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </button>



          </>
        )}

        {/* Contact is only searchable once a Grampanchayat is picked - both
            because it's meaningless before then, and because the results
            EntitySearchSelect shows are already hard-scoped to that GP (see
            searchPersons above + backend personController#listPersons).
            showContact already implies showGramPanchayat is true (see the
            derivation above) - an admin can't configure Contact visible
            while Gram Panchayat is hidden. */}
        {showContact && (gramPanchayat ? (
          <EntitySearchSelect
            label={`${t("contactPerson")}${requireContact ? " *" : ""}`}
            placeholder={t("searchPersonPlaceholder")}
            fetchResults={searchPersons}
            value={person}
            onChange={selectPerson}
            emptyHint={`No contacts on file for ${displayName(gramPanchayat, language).primary} yet. Use "${t("suggestNewContact")}" below.`}
            renderOption={(p) => <p className="text-sm font-medium text-ink">{contactOptionLabel(p, language)}</p>}
            renderSelected={(p) => <p className="text-sm font-medium text-ink">{contactOptionLabel(p, language)}</p>}
          />
        ) : (
          <div>
            <label className="field-label">{t("contactPerson")}</label>
            <p className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2.5 text-sm text-ink-muted">
              {t("selectGpFirst")}
            </p>
          </div>
        ))}

        {/* Once a contact is picked, this section is "confirm/correct their
            details" (edits an existing directory record via an approval
            queue). Without one picked, it's "this person isn't in our
            list" - a brand-new-contact suggestion, tied to the selected
            Grampanchayat so approving it actually links them there instead
            of creating a directory entry nobody can find. */}
        {showContact && gramPanchayat && (
          <div className="rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setContactDetailsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink-soft"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-ink-muted" />
                {person ? t("contactDetailsConfirm") : t("suggestNewContact")}
              </span>
              {contactDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          {contactDetailsOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-line pt-3">
              <p className="text-xs text-ink-muted -mt-1">
                {!person && `${t("suggestForGp")} ${displayName(gramPanchayat, language).primary}. `}
                {t("contactDetailsHint")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label">{t("name")} (English)</label>
                  <input className="field-input" value={contactDetails.name} onChange={(e) => setContactDetails((c) => ({ ...c, name: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">{t("nameMarathi")}</label>
                  <input className="field-input" value={contactDetails.nameMr} onChange={(e) => setContactDetails((c) => ({ ...c, nameMr: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">{t("designation")}{!person && " *"}</label>
                  <select className="field-input" value={contactDetails.designation} onChange={(e) => setContactDetails((c) => applyDesignationChange(c, "designation", e.target.value))}>
                    <option value="">Select…</option>
                    <DesignationOptions />
                  </select>
                </div>
                <div>
                  <label className="field-label">{t("designationMarathi")}</label>
                  <DesignationMrSelect value={contactDetails.designationMr} onChange={(v) => setContactDetails((c) => applyDesignationChange(c, "designationMr", v))} />
                </div>
                <div>
                  <label className="field-label">{t("phone")}</label>
                  <input className="field-input" value={contactDetails.phone || ""} onChange={(e) => setContactDetails((c) => ({ ...c, phone: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">{t("address")} (English)</label>
                  <input className="field-input" value={contactDetails.address} onChange={(e) => setContactDetails((c) => ({ ...c, address: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="field-label">{t("addressMarathi")}</label>
                  <input className="field-input" value={contactDetails.addressMr} onChange={(e) => setContactDetails((c) => ({ ...c, addressMr: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
          </div>
        )}

        <div>
          <label className="field-label">
            {t("notesLabel")} <span className="text-signal-500">*</span>
          </label>
          <textarea
            required
            className="field-textarea"
            rows={4}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder={t("notesPlaceholder")}
          />
        </div>

        {fieldsLoading ? (
          <p className="text-xs text-ink-muted">Loading fields for this activity type…</p>
        ) : (
          <DynamicFields
            fields={customFieldDefs}
            values={customValues}
            onChange={(k, v) => setCustomValues((c) => ({ ...c, [k]: v }))}
          />
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? t("saving") : t("saveEntry")}
          </button>
          <button type="button" onClick={() => navigate(isAdmin ? "/admin/dashboard" : "/dashboard")} className="btn btn-ghost">
            {t("backToDashboard")}
          </button>
        </div>
      </form>

      <NewGramPanchayatRequest open={newGpOpen} onClose={() => setNewGpOpen(false)} />
    </div>
  );
}
