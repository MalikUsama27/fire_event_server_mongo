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
const API_KEY = process.env.API_KEY || "";

// WhatsApp Cloud API config (Meta)
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || "";
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || "";
const WA_TO = process.env.WA_TO || "";

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
    image_url: { type: String, default: "" },
    cloudinary_public_id: { type: String, default: "" },

    ip: { type: String, default: "" },
    user_agent: { type: String, default: "" }
  },
  { collection: "fire_events" }
);

const FireEvent = mongoose.model("FireEvent", fireEventSchema);

// ---- Optional auth middleware ----
function requireAuth(req, res, next) {
  if (!API_KEY) return next();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

// ---- WhatsApp sender ----
async function sendWhatsAppAlert({ to, text }) {
  // If not configured, silently skip
  if (!WA_PHONE_NUMBER_ID || !WA_ACCESS_TOKEN || !to) return { skipped: true };

  const url = `https://graph.facebook.com/v21.0/${WA_PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) {
    // throw error so caller can log it
    throw new Error(JSON.stringify(data));
  }
  return data;
}

// ---- Routes ----
app.get("/", (req, res) => {
  res.send("Welcome to Fire detection App");
});

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "up", time: new Date().toISOString() });
});

// Receive realtime events (JSON only)
app.post("/api/fire-events", requireAuth, async (req, res) => {
  const body = req.body || {};

  const timestamp = typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString();
  const score = typeof body.score === "string" ? body.score : "";
  const best = typeof body.best === "object" && body.best !== null ? body.best : null;

  const snapshot_filename = typeof body.snapshot_filename === "string" ? body.snapshot_filename : "";
  const image_url = typeof body.image_url === "string" ? body.image_url : "";
  const cloudinary_public_id = typeof body.cloudinary_public_id === "string" ? body.cloudinary_public_id : "";

  const event = {
    timestamp,
    score,
    best,
    snapshot_filename,
    image_url,
    cloudinary_public_id,
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    user_agent: req.headers["user-agent"] || ""
  };

  try {
    const saved = await FireEvent.create(event);

    // ✅ Send WhatsApp after saving (non-blocking style: we try and log errors)
    const msgText =
      `🔥 FIRE ALERT!\n` +
      `Time: ${timestamp}\n` +
      `Score: ${score}\n` +
      `Label: ${best?.label || "-"}\n` +
      `Conf: ${best?.conf ? Number(best.conf).toFixed(2) : "-"}\n` +
      `Image: ${image_url || snapshot_filename || "-"}`;

    // Send only if WA_TO exists
    if (WA_TO) {
      sendWhatsAppAlert({ to: WA_TO, text: msgText })
        .then((r) => console.log("✅ WhatsApp sent:", r))
        .catch((e) => console.log("❌ WhatsApp failed:", e.message));
    } else {
      console.log("⚠️ WA_TO not set, WhatsApp skipped.");
    }

    return res.json({ ok: true, message: "Event stored", event: saved });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Failed to store event", details: String(e) });
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
    console.log(`GET  /`);
    console.log(`GET  /health`);
    console.log(`POST /api/fire-events`);
    console.log(`GET  /api/fire-events?limit=50`);
    console.log(WA_PHONE_NUMBER_ID ? "✅ WhatsApp: configured" : "⚠️ WhatsApp: not configured");
  });
}

start();
