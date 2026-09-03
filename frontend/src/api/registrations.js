import { api } from "./client";

export const registrationApi = {
  submit: (payload) => api.post("/registrations", payload).then((r) => r.data),
  list: (params) => api.get("/registrations", { params }).then((r) => r.data),
  get: (id) => api.get(`/registrations/${id}`).then((r) => r.data),
  updateStatus: (id, status) => api.patch(`/registrations/${id}`, { status }).then((r) => r.data),
  updateDetails: (id, payload) => api.patch(`/registrations/${id}/details`, payload).then((r) => r.data),
  merge: (id) => api.post(`/registrations/${id}/merge`).then((r) => r.data),
};
