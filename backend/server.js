require("dotenv/config");
const http = require("http");
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const { validateEnv } = require("./src/config/validateEnv");
const { connectDB } = require("./src/config/db");
const { initSocket } = require("./src/sockets");
const { errorHandler, notFound } = require("./src/middleware/errorHandler");

// Fail fast on missing/unsafe config, before touching the database or
// binding a port - a broken deploy should never half-start.
validateEnv();

const authRoutes = require("./src/routes/authRoutes");
const employeeRoutes = require("./src/routes/employeeRoutes");
const gramPanchayatRoutes = require("./src/routes/gramPanchayatRoutes");
const personRoutes = require("./src/routes/personRoutes");
const activityRoutes = require("./src/routes/activityRoutes");
const activityTypeRoutes = require("./src/routes/activityTypeRoutes");
const formFieldRoutes = require("./src/routes/formFieldRoutes");
const feedbackRoutes = require("./src/routes/feedbackRoutes");
const searchRoutes = require("./src/routes/searchRoutes");
const overviewRoutes = require("./src/routes/overviewRoutes");
const importRoutes = require("./src/routes/importRoutes");
const changeRequestRoutes = require("./src/routes/changeRequestRoutes");
const registrationRoutes = require("./src/routes/registrationRoutes");
const taskRoutes = require("./src/routes/taskRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");

const app = express();
const httpServer = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim());

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "2mb" }));
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// Liveness: "is the process up and able to handle a request at all". No DB
// hit, no dependency checks - must stay fast even if Mongo is having a bad
// day, since a load balancer/orchestrator uses this to decide whether to
// kill and restart the container. Exposed at both paths: unprefixed /health
// is the conventional path most platforms/orchestrators probe by default,
// /api/health is kept for existing callers/monitors already pointed at it.
function liveness(req, res) {
  res.json({ status: "ok" });
}
app.get("/health", liveness);
app.get("/api/health", (req, res) => res.json({ ok: true, status: "ok", time: new Date().toISOString() }));

// Readiness: "is the app actually able to serve real requests right now" -
// i.e. is the database connection up. Used by orchestration platforms to
// decide whether to route traffic to this instance (vs. just whether to
// keep the process alive, which is what /health answers). mongoose.connection
// .readyState is an in-memory flag, not a network call, so this stays cheap;
// it does not open a new connection or run a query.
app.get("/health/ready", (req, res) => {
  const dbReady = mongoose.connection.readyState === 1; // 1 = connected
  if (!dbReady) {
    return res.status(503).json({ status: "not_ready", database: "disconnected" });
  }
  return res.json({ status: "ready", database: "connected" });
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/grampanchayats", gramPanchayatRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/activity-types", activityTypeRoutes);
app.use("/api/form-fields", formFieldRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/import", importRoutes);
app.use("/api/change-requests", changeRequestRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  initSocket(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`[server] GramSoft API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then close the DB connection - so a deploy/restart/container
// reschedule never cuts off a request mid-write or leaves a dangling Mongo
// connection behind. Orchestrators (Docker, Kubernetes, most PaaS) send
// SIGTERM first and only SIGKILL after a grace period, so handling SIGTERM
// here is what actually avoids that hard kill.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[server] Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  httpServer.close(async (err) => {
    if (err) console.error("[server] Error while closing HTTP server:", err.message);
    try {
      await mongoose.connection.close(false);
      console.log("[server] MongoDB connection closed.");
    } catch (closeErr) {
      console.error("[server] Error closing MongoDB connection:", closeErr.message);
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A truly unexpected error should still be logged with full context and
// crash the process (rather than continue in a possibly-corrupted state) -
// but crash on purpose, not via an unhandled native crash with no log line.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception:", err);
  process.exit(1);
});
