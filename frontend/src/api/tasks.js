import { api } from "./client";

export const taskApi = {
  list: (params) => api.get("/tasks", { params }).then((r) => r.data),
  create: (payload) => api.post("/tasks", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/tasks/${id}`, payload).then((r) => r.data),
  updateStatus: (id, payload) => api.patch(`/tasks/${id}/status`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/tasks/${id}`).then((r) => r.data),
};
