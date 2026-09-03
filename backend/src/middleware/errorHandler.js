// Mongoose duplicate-key errors and validation errors get a friendlier
// shape than a raw stack trace; anything unexpected falls back to a
// generic 500 so internals never leak to the client.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);

  if (err.code === 11000) {
    return res.status(409).json({ error: "A record with this value already exists" });
  }
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(", ") || "Invalid data";
    return res.status(400).json({ error: message });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Invalid id" });
  }

  console.error("[error]", err);
  const status = err.status || 500;
  return res.status(status).json({ error: err.publicMessage || "Something went wrong" });
}

function notFound(req, res) {
  res.status(404).json({ error: `No route: ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };
