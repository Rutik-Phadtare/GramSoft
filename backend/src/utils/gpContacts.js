const Person = require("../models/Person");
const PersonAssignment = require("../models/PersonAssignment");
const ChangeHistory = require("../models/ChangeHistory");
const { normalizeName, normalizePhone } = require("./normalize");
const { logFieldChanges } = require("./diffFields");
const { findHolderConflict, isSingleHolder } = require("./singleHolderGuard");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_FIELDS = ["name", "nameMr", "designation", "designationMr", "phone", "email", "address", "addressMr", "district", "notes"];
const MAX_CONTACTS = 20;

// Person field rules shared by every Person-creating path (approval edits,
// contacts submitted with a new Grampanchayat). Returns an error string or null.
function validatePersonFields(values) {
  if ("designation" in values && values.designation !== "" && !Person.DESIGNATIONS.includes(values.designation)) {
    return `designation must be one of: ${Person.DESIGNATIONS.join(", ")}`;
  }
  if ("email" in values && values.email && !EMAIL_RE.test(String(values.email).trim())) {
    return "Email address is not valid";
  }
  if ("phone" in values && values.phone && String(normalizePhone(values.phone) || "").length < 10) {
    return "Phone number must have 10 digits";
  }
  return null;
}

// Person document fields for create - one definition for every creation path.
function buildPersonDoc(changes, normalizedPhone) {
  return {
    name: changes.name,
    nameMr: changes.nameMr,
    nameKey: normalizeName(changes.name || changes.nameMr),
    designation: changes.designation,
    designationMr: changes.designationMr,
    phone: normalizedPhone,
    email: changes.email,
    address: changes.address,
    addressMr: changes.addressMr,
    district: changes.district,
    notes: changes.notes,
  };
}

const contactLabel = (p) => [p?.name || p?.nameMr, p?.phone, p?.designation].filter(Boolean).join(" | ");

/**
 * Validates and cleans a `contacts` array submitted together with a new GP,
 * BEFORE anything is written: required name + designation, field rules, no
 * duplicate phone within the batch or against existing contacts, and no two
 * holders of the same single-holder designation in one new GP.
 * Returns { contacts } or { error, status }.
 */
async function prepareGpContacts(raw) {
  if (raw === undefined || raw === null) return { contacts: [] };
  if (!Array.isArray(raw)) return { error: "contacts must be a list", status: 400 };
  if (raw.length > MAX_CONTACTS) return { error: `At most ${MAX_CONTACTS} contacts can be added at once`, status: 400 };

  const contacts = [];
  const phones = new Set();
  const singles = new Set();
  for (let i = 0; i < raw.length; i += 1) {
    const label = `Contact ${i + 1}`;
    const c = {};
    for (const key of CONTACT_FIELDS) {
      const v = raw[i]?.[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") c[key] = String(v).trim();
    }
    if (!c.name && !c.nameMr) return { error: `${label}: a name (English or Marathi) is required`, status: 400 };
    if (!c.designation) return { error: `${label}: a designation is required`, status: 400 };
    const err = validatePersonFields(c);
    if (err) return { error: `${label}: ${err}`, status: 400 };

    c.phoneNormalized = normalizePhone(c.phone);
    if (c.phoneNormalized) {
      if (phones.has(c.phoneNormalized)) return { error: `${label}: phone number is repeated in this submission`, status: 409 };
      phones.add(c.phoneNormalized);
    }
    if (isSingleHolder(c.designation)) {
      if (singles.has(c.designation)) return { error: `${label}: a Grampanchayat can have only one ${c.designation}`, status: 409 };
      singles.add(c.designation);
    }
    contacts.push(c);
  }
  if (phones.size) {
    const dup = await Person.findOne({ phone: { $in: [...phones] } }).select("name phone");
    if (dup) return { error: `A contact with phone ${dup.phone} already exists - add them to this Grampanchayat after it is created`, status: 409 };
  }
  return { contacts };
}

/** Deletes everything createGpContacts made (compensating rollback). */
async function rollbackGpContacts(created) {
  const personIds = created.people.map((p) => p._id);
  if (!personIds.length) return;
  await PersonAssignment.deleteMany({ personId: { $in: personIds } });
  await ChangeHistory.deleteMany({ entityType: "Person", entityId: { $in: personIds } });
  await Person.deleteMany({ _id: { $in: personIds } });
}

/**
 * Creates real Person + PersonAssignment records (and history) for a freshly
 * created GP, using the same models/rules as the normal contact workflow. On
 * any failure everything created here is removed and the error rethrown, so
 * the caller can remove the GP too - never a half-created GP.
 */
async function createGpContacts({ gramPanchayat, contacts, userId, source = "direct" }) {
  const created = { people: [], assignments: [] };
  try {
    for (const c of contacts) {
      const conflict = await findHolderConflict({ gramPanchayatId: gramPanchayat._id, designation: c.designation });
      if (conflict) throw new Error(`${conflict.personId?.name || "Someone"} already holds ${c.designation} at this Grampanchayat`);

      const person = await Person.create(buildPersonDoc(c, c.phoneNormalized));
      created.people.push(person);
      await logFieldChanges({ entityType: "Person", entityId: person._id, before: {}, updates: Object.fromEntries(CONTACT_FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, k === "phone" ? c.phoneNormalized : c[k]])), changedBy: userId, source });
      created.assignments.push(
        await PersonAssignment.create({
          personId: person._id, gramPanchayatId: gramPanchayat._id,
          designationAtAssignment: person.designation, fromDate: new Date(), toDate: null,
        })
      );
      await ChangeHistory.create({
        entityType: "GramPanchayat", entityId: gramPanchayat._id, field: "contact",
        oldValue: null, newValue: contactLabel(person), changedBy: userId || undefined, source,
      });
    }
    return created;
  } catch (err) {
    await rollbackGpContacts(created).catch(() => {});
    throw err;
  }
}

module.exports = { validatePersonFields, buildPersonDoc, prepareGpContacts, createGpContacts, rollbackGpContacts };
