import { api } from "./client";

export const searchApi = {
  run: (params) => api.get("/search", { params }).then((r) => r.data),
};
