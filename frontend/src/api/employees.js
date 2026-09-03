import { api } from "./client";

export const employeeApi = {
  list: () => api.get("/employees").then((r) => r.data),
  get: (id) => api.get(`/employees/${id}`).then((r) => r.data),
  create: (payload) => api.post("/employees", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/employees/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/employees/${id}`).then((r) => r.data),
  myOverview: () => api.get("/employees/overview").then((r) => r.data),
  permissionRegistry: () => api.get("/employees/permissions/registry").then((r) => r.data),
};
