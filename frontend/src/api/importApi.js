import { api } from "./client";

export const importApi = {
  upload: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post("/import", formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data);
  },
};
