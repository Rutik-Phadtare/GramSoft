import { api } from "./client";

export const formFieldApi = {
  // activityTypeKey is only meaningful when target === "activity" - see
  // backend/src/controllers/formFieldController.js for the scoping rules.
  list: (target, activityTypeKey) =>
    api.get("/form-fields", { params: { target, activityTypeKey: activityTypeKey || undefined } }).then((r) => r.data),
  // Admin-only: includes inactive fields, for the Form Builder.
  listForAdmin: (target, activityTypeKey) =>
    api.get("/form-fields/manage", { params: { target, activityTypeKey: activityTypeKey || undefined } }).then((r) => r.data),
  create: (payload) => api.post("/form-fields", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/form-fields/${id}`, payload).then((r) => r.data),
  duplicate: (id) => api.post(`/form-fields/${id}/duplicate`).then((r) => r.data),
  reorder: (target, activityTypeKey, order) =>
    api.patch("/form-fields/reorder", { target, activityTypeKey: activityTypeKey || null, order }).then((r) => r.data),
  remove: (id) => api.delete(`/form-fields/${id}`).then((r) => r.data),
};
