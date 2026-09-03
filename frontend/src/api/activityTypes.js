import { api } from "./client";

export const activityTypeApi = {
  // Active-only - what an employee is offered when logging an activity.
  list: () => api.get("/activity-types").then((r) => r.data),
  // Admin only - active + inactive, for the Settings screen.
  listForAdmin: () => api.get("/activity-types/manage").then((r) => r.data),
  create: (payload) => api.post("/activity-types", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/activity-types/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/activity-types/${id}`).then((r) => r.data),
};
