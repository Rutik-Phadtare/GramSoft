const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

function initSocket(httpServer) {
  const origins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((s) => s.trim());

  io = new Server(httpServer, {
    cors: { origin: origins, credentials: true },
  });

  // Every socket connection carries the same JWT used for the REST API, so
  // "live" truly means "logged in as this person" - not a public firehose.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Not authenticated"));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket) => {
    // Two rooms: everyone in "role:admin" gets org-wide events (new
    // activity from any employee, new feedback, imports, etc). Everyone
    // also gets their own "user:<id>" room for events scoped to just them.
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === "admin") {
      socket.join("role:admin");
    }
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized - call initSocket(server) first");
  return io;
}

// Convenience emitters used throughout the controllers. Every mutation that
// admins or the acting employee should see live goes through one of these,
// so "where does this event get sent" lives in one file instead of being
// re-decided at every call site.
function emitToAdmins(event, payload) {
  if (!io) return;
  io.to("role:admin").emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, getIO, emitToAdmins, emitToUser };
