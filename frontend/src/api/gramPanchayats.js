import { api } from "./client";

export const gramPanchayatApi = {
  list: (params, config) => api.get("/grampanchayats", { params, ...config }).then((r) => r.data),
  filterOptions: (district) => api.get("/grampanchayats/filter-options", { params: { district } }).then((r) => r.data),
  async downloadCsv(params) {
    const response = await api.get("/grampanchayats/export", { params, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gramsoft-grampanchayats-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  get: (id) => api.get(`/grampanchayats/${id}`).then((r) => r.data),
  create: (payload) => api.post("/grampanchayats", payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/grampanchayats/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/grampanchayats/${id}`).then((r) => r.data),
  addContact: (id, payload) => api.post(`/grampanchayats/${id}/contacts`, payload).then((r) => r.data),
  history: (id) => api.get(`/grampanchayats/${id}/history`).then((r) => r.data),
};
