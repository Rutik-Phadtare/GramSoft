import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// A stale-chunk failure happens when a lazy-loaded route's JS file 404s -
// almost always because the app was redeployed (new asset hashes) while
// someone had the old page open in their tab, and they then navigate to a
// route whose chunk was part of the old build. It surfaces as a plain JS
// error, not anything React-specific, so it's detected by matching the
// error message/name rather than by type.
function isChunkLoadError(error) {
  const message = String(error?.message || "");
  return (
    error?.name === "ChunkLoadError" ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

// Catches any render-time error below it in the tree (including a failed
// React.lazy() import) and shows a recoverable screen instead of leaving
// the user on a blank white page - the default outcome of an uncaught
// render error with no boundary in place. This is intentionally the ONLY
// error boundary in the app (wrapped once around <App /> in main.jsx): one
// broad safety net is more valuable than several partial ones scattered
// per-page, and keeps the recovery behavior consistent everywhere.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Centralized place to wire up real error reporting later (Sentry, etc.)
    // without touching every page - for now, at minimum this ends up in
    // server/browser logs instead of silently vanishing.
    console.error("[ErrorBoundary] Unhandled render error:", error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunkFailure = isChunkLoadError(error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
        <div className="max-w-sm w-full text-center">
          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <p className="font-display text-base font-semibold text-ink mb-1">
            {chunkFailure ? "A new version is available" : "Something went wrong"}
          </p>
          <p className="text-sm text-ink-muted mb-5">
            {chunkFailure
              ? "This page was updated since you loaded it. Reload to get the latest version."
              : "The page hit an unexpected error. Reloading usually fixes it - if it keeps happening, let an admin know what you were doing."}
          </p>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white text-sm font-medium px-4 py-2 hover:bg-brand-700 transition-colors"
          >
            <RotateCw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
