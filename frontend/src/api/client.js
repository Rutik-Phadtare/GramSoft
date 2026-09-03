import axios from "axios";

// In dev, VITE_API_URL is empty and Vite's proxy forwards "/api/..." to the
// backend (see vite.config.js) - so same-origin requests, no CORS involved.
// In production, set VITE_API_URL to the deployed backend's origin.
const baseURL = `${import.meta.env.VITE_API_URL || ""}/api`;

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("gramsoft_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("gramsoft_token");
      localStorage.removeItem("gramsoft_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Small helper so callers can write `catch (err) { setError(apiErrorMessage(err)) }`
// instead of digging through the axios error shape every time.
export function apiErrorMessage(err) {
  return err?.response?.data?.error || err?.message || "Something went wrong";
}
