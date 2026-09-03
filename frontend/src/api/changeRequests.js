import { api } from "./client";

export const changeRequestApi = {
  create: (payload) => api.post("/change-requests", payload).then((r) => r.data),
  list: (params) => api.get("/change-requests", { params }).then((r) => r.data),
  update: (id, proposedChanges) => api.patch(`/change-requests/${id}`, { proposedChanges }).then((r) => r.data),
  approve: (id, edits, confirmReplaceHolder) =>
    api
      .post(`/change-requests/${id}/approve`, { ...(edits ? { edits } : {}), ...(confirmReplaceHolder ? { confirmReplaceHolder: true } : {}) })
      .then((r) => r.data),
  reject: (id, reviewNote) => api.post(`/change-requests/${id}/reject`, { reviewNote }).then((r) => r.data),
};
