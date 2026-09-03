import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("gramsoft_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupted/truncated value (manual edit, storage quota issue, etc.)
      // shouldn't crash the whole app before it's even rendered - treat it
      // as "logged out" and let /auth/me (or a fresh login) sort it out.
      localStorage.removeItem("gramsoft_user");
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("gramsoft_token"));
  const [loading, setLoading] = useState(true);

  // Restore/validate the session on first load - a stored token might have
  // expired, or the account might have been deactivated since.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await authApi.me();
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("gramsoft_token");
          localStorage.removeItem("gramsoft_user");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    localStorage.setItem("gramsoft_token", data.token);
    localStorage.setItem("gramsoft_user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("gramsoft_token");
    localStorage.removeItem("gramsoft_user");
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, logout, isAdmin: user?.role === "admin" }),
    [user, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
