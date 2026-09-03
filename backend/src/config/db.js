const mongoose = require("mongoose");
const { srvUriToStandardUri } = require("./resolveSrvViaDoH");

async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment variables");
  }

  let uri = MONGODB_URI;

  // If this is a +srv URI, resolve it over DNS-over-HTTPS first so the
  // Mongo driver never has to do its own SRV lookup over UDP:53 (see
  // resolveSrvViaDoH.js for why that matters on some networks). If DoH
  // resolution itself fails (e.g. no internet at all), fall back to
  // letting the driver try its own system DNS resolution as a last resort.
  if (uri.startsWith("mongodb+srv://")) {
    try {
      uri = await srvUriToStandardUri(uri);
    } catch (err) {
      console.warn("[db] DNS-over-HTTPS SRV resolution failed, falling back to system DNS:", err.message);
      uri = MONGODB_URI;
    }
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { bufferCommands: false });
  console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);

  mongoose.connection.on("error", (err) => console.error("[db] connection error:", err.message));
  mongoose.connection.on("disconnected", () => console.warn("[db] disconnected"));
}

module.exports = { connectDB };
