const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signToken } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");

// POST /api/auth/login - public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim(), active: true });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user);
  return res.json({
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, team: user.team, permissions: user.permissions },
  });
});

// GET /api/auth/me - requires a valid token, used to restore a session on refresh
const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash");
  if (!user || !user.active) {
    return res.status(401).json({ error: "Session no longer valid" });
  }
  return res.json({
    user: { id: user._id, name: user.name, email: user.email, role: user.role, team: user.team, permissions: user.permissions },
  });
});

module.exports = { login, me };
