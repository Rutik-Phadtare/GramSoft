// Fails the process fast, with a clear message, if required configuration
// is missing or obviously unsafe - instead of limping along and hitting a
// confusing runtime error (or silently signing tokens with `undefined`)
// the first time some unrelated request needs the setting.
//
// Called once at startup, before connectDB()/initSocket() - see server.js.

const INSECURE_JWT_SECRETS = new Set([
  "secret", "changeme", "change-me", "replace-with-a-long-random-string", "your-secret-key", "jwt-secret",
]);

function validateEnv() {
  const problems = [];

  if (!process.env.MONGODB_URI) {
    problems.push("MONGODB_URI is not set - the app has nowhere to store data.");
  }

  if (!process.env.JWT_SECRET) {
    problems.push("JWT_SECRET is not set - login tokens cannot be signed or verified safely.");
  } else if (process.env.JWT_SECRET.length < 32) {
    problems.push("JWT_SECRET is too short (needs 32+ characters) to resist brute-forcing.");
  } else if (INSECURE_JWT_SECRETS.has(process.env.JWT_SECRET.toLowerCase())) {
    problems.push("JWT_SECRET is a well-known placeholder value - generate a real random secret.");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.CLIENT_URL) {
      problems.push("CLIENT_URL is not set in production - CORS will fall back to localhost, which is wrong for a deployed frontend.");
    } else if (process.env.CLIENT_URL.split(",").some((origin) => origin.trim().includes("localhost"))) {
      problems.push("CLIENT_URL includes a localhost origin in production - remove it so only your real deployed frontend(s) can call the API.");
    }
  }

  if (problems.length) {
    console.error("[config] Refusing to start - fix the following and restart:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
}

module.exports = { validateEnv };
