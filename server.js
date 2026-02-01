const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

// ---- Config ----
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MONGODB_URI = process.env.MONGODB_URI || "";
// Optional Bearer token auth. If empty -> no auth
const API_KEY = process.env.API_KEY || "";

// ---- Middlewares ----
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ---- Mongo Model ----
const fireEventSchema = new mongoose.Schema(
  {
    received_at: { type: Date, default: Date.now },
    timestamp: { type: String, required: true },
    score: { type: String, default: "" },
    best: { type: Object, default: null },
    snapshot_filename: { type: String, default: "" },
    ip: { type: String, default: "" },
    user_agent: { type: String, default: "" }
  },
  { collection: "fire_events" }
);

const FireEvent = mongoose.model("FireEvent", fireEventSchema);

// ---- Optional auth middleware ----
function requireAuth(req, res, next) {
  if (!API_KEY) return next(); // auth disabled
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

// ---- Routes ----
app.get("/health", (req, res) => {
  res.json({ ok: true, status: "up", time: new Date().toISOString() });
});
app.get("/", (req, res) => {
  res.send("Welcome to Fire detection App");
});

// Receive realtime events
app.post("/api/fire-events", requireAuth, async (req, res) => {
  const body = req.body || {};

  const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
  const score = typeof body.score === "string" ? body.score : "";
  const best = (typeof body.best === "object" && body.best !== null) ? body.best : null;
  const snapshot_filename = typeof body.snapshot_filename === "string" ? body.snapshot_filename : "";

  const event = {
    timestamp,
    score,
    best,
    snapshot_filename,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    user_agent: req.headers["user-agent"] || ""
  };

  try {
    const saved = await FireEvent.create(event);
    res.json({ ok: true, message: "Event stored", event: saved });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Failed to store event", details: String(e) });
  }
});

// Read last N events
app.get("/api/fire-events", requireAuth, async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));

  try {
    const events = await FireEvent.find().sort({ received_at: -1 }).limit(limit).lean();
    res.json({ ok: true, count: events.length, events });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Failed to read events", details: String(e) });
  }
});

// ---- Start ----
async function start() {
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI missing. Set it in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, { autoIndex: true });
    console.log("✅ Connected to MongoDB");
  } catch (e) {
    console.error("❌ MongoDB connection failed:", e);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`✅ Fire Event Server (Mongo) running on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`POST events: http://localhost:${PORT}/api/fire-events`);
    if (API_KEY) console.log("Auth: ENABLED (Bearer token)");
    else console.log("Auth: DISABLED");
  });
}

start();
