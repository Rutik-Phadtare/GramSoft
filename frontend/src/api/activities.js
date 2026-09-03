import { api } from "./client";

export const activityApi = {
  create: (payload) => api.post("/activities", payload).then((r) => r.data),
  list: (params) => api.get("/activities", { params }).then((r) => r.data),
  // The export route requires auth, so it can't be a plain <a href> link -
  // fetch it as a blob (picking up the Authorization header via the axios
  // interceptor) and trigger a save manually instead.
  async downloadCsv(params) {
    const response = await api.get("/activities/export", { params, responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gramsoft-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
