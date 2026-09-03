import { api } from "./client";

// Public - the registration form needs these before the submitter has
// logged in (they never do), and they're not sensitive.
export const rateDefaultsApi = {
  get: () => api.get("/grampanchayats/rate-defaults").then((r) => r.data),
};
