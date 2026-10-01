import { api } from "./client";

export const personApi = {
  list: (params, config) => api.get("/persons", { params, ...config }).then((r) => r.data),
  filterOptions: () => api.get("/persons/filter-options").then((r) => r.data),
  async downloadCsv(params) {
    const response = await api.get("/persons/export", { params, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gramsoft-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  get: (id) => api.get(`/persons/${id}`).then((r) => r.data),
  create: (payload) => api.post("/persons", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/persons/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/persons/${id}`).then((r) => r.data),
  transfer: (id, payload) => api.post(`/persons/${id}/transfer`, payload).then((r) => r.data),
  history: (id) => api.get(`/persons/${id}/history`).then((r) => r.data),
};
