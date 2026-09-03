import { api } from "./client";

export const notificationApi = {
  list: (params) => api.get("/notifications", { params }).then((r) => r.data),
  read: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  readAll: () => api.patch("/notifications/read-all").then((r) => r.data),
  readSection: (section) => api.patch(`/notifications/read-section/${section}`).then((r) => r.data),
};
