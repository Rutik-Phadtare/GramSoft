import { api } from "./client";

export const feedbackApi = {
  submit: (payload) => api.post("/feedback", payload).then((r) => r.data),
  list: (status, page, limit) => api.get("/feedback", { params: { status, page, limit } }).then((r) => r.data),
  updateStatus: (id, status) => api.patch(`/feedback/${id}`, { status }).then((r) => r.data),
  updateDetails: (id, payload) => api.patch(`/feedback/${id}/details`, payload).then((r) => r.data),
  merge: (id) => api.post(`/feedback/${id}/merge`).then((r) => r.data),
  // Same blob-download pattern as activities/persons/grampanchayats - the
  // export route needs auth, so a plain <a href> can't be used.
  async downloadCsv(status) {
    const response = await api.get("/feedback/export", { params: { status }, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gramsoft-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
