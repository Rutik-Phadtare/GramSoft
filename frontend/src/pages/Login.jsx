import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sprout, Eye, EyeOff, Languages } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { apiErrorMessage } from "../api/client";

export default function Login() {
  const { login, user, isAdmin } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fallback = isAdmin ? "/admin/dashboard" : "/dashboard";
    navigate(location.state?.from?.pathname || fallback, { replace: true });
  }, [user, isAdmin, navigate, location.state?.from?.pathname]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const loggedInUser = await login(email.trim(), password);
      navigate(loggedInUser.role === "admin" ? "/admin/dashboard" : "/dashboard", { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white transition-colors"
          >
            <Languages className="h-3.5 w-3.5" />
            <span className={language === "en" ? "text-white" : ""}>EN</span>
            <span>/</span>
            <span className={language === "mr" ? "text-white" : ""}>मर</span>
          </button>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center mb-4">
            <Sprout className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <h1 className="font-display text-xl font-semibold text-white">GramSoft</h1>
          <p className="text-sm text-white/45 mt-1">{t("signInTitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-5 sm:p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-signal-50 text-signal-600 text-sm px-3 py-2">{error}</div>
          )}

          <div>
            <label className="field-label">{t("email")}</label>
            <input
              type="email"
              required
              autoFocus
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="field-label">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                className="field-input pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-soft"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary w-full mt-2">
            {submitting ? t("signingIn") : t("signIn")}
          </button>
        </form>

        <p className="text-center text-xs text-white/35 mt-6">
          {t("accountsCreatedByAdmin")}
        </p>
      </div>
    </div>
  );
}
