import { api } from "./client";

export const overviewApi = {
  admin: () => api.get("/overview/admin").then((r) => r.data),
};
