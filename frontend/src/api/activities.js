import { api } from "./client";

// The export routes require auth, so they can't be plain <a href> links -
// fetch as a blob (picking up the Authorization header via the axios
// interceptor) and trigger a save manually instead.
async function saveCsv(path, params, filename) {
  const response = await api.get(path, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const activityApi = {
  create: (payload) => api.post("/activities", payload).then((r) => r.data),
  list: (params) => api.get("/activities", { params }).then((r) => r.data),
  // Admin only: the complete record (activity + contact + proposals + history).
  get: (id) => api.get(`/activities/${id}`).then((r) => r.data),
  downloadCsv: (params) => saveCsv("/activities/export", params, `gramsoft-activity-${new Date().toISOString().slice(0, 10)}.csv`),
  downloadOne: (id) => saveCsv(`/activities/${id}/export`, undefined, `gramsoft-activity-${id}.csv`),
};
