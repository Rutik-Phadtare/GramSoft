const jwt = require("jsonwebtoken");

function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(), name: user.name, email: user.email, role: user.role, team: user.team,
      // Snapshotted at login, same staleness tradeoff as `role`/`active` -
      // an admin changing an employee's permissions takes effect on that
      // employee's next login, not instantly on an already-issued token.
      permissions: user.permissions || undefined,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// Verifies the Bearer token and attaches the decoded payload as req.user.
// Deliberately stateless (no DB hit per request) for speed - a deactivated
// employee's existing token stays valid until it expires, which is an
// accepted tradeoff for an internal tool with short-lived tokens. Force
// logout by rotating JWT_SECRET if an account needs cutting off instantly.
function protect(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

// Gates a route on a per-employee permission flag admins set in
// Settings → Employees. Admins always pass (they aren't subject to
// employee-level permissions). A permission that's missing/undefined is
// treated as allowed, so existing accounts keep working exactly as before
// until an admin explicitly flips something off for someone.
function requirePermission(key) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (req.user.role === "admin") return next();
    const perms = req.user.permissions || {};
    if (perms[key] === false) {
      return res.status(403).json({ error: "You don't have permission to do this" });
    }
    next();
  };
}

module.exports = { signToken, protect, requireAdmin, requirePermission };
