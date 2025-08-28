// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config ----
const PORT = process.env.PORT || 3000;
const AUTUMN_API_BASE = process.env.AUTUMN_API_BASE; // e.g. https://api.autumn.run
const AUTUMN_API_KEY = process.env.AUTUMN_API_KEY;
const AUTUMN_FEATURE_KEY = process.env.AUTUMN_FEATURE_KEY || "joke_feature";
const AUTUMN_PLAN_ID = process.env.AUTUMN_PLAN_ID || null;

// For this demo we hardcode a fake user id.
// In a real app, use your auth session's user.id.
const DEMO_USER_ID = "demo-user-123";

// ---- Minimal Autumn client (server-side) ----
async function autumnCheck({ userId, featureKey }) {
  const res = await fetch(`${AUTUMN_API_BASE}/check`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${AUTUMN_API_KEY}`,
    },
    body: JSON.stringify({ user_id: userId, feature_key: featureKey }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autumn /check failed: ${res.status} ${text}`);
  }
  // Expecting { allowed: boolean, reason?: string }
  return res.json();
}

async function autumnTrack({ userId, featureKey, amount = 1 }) {
  const res = await fetch(`${AUTUMN_API_BASE}/track`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${AUTUMN_API_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      feature_key: featureKey,
      amount,
      meta: { source: "joke-demo" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autumn /track failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function autumnCheckout({ userId, planId = AUTUMN_PLAN_ID }) {
  const payload = { user_id: userId };
  if (planId) payload.plan_id = planId;

  const res = await fetch(`${AUTUMN_API_BASE}/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${AUTUMN_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Autumn /checkout failed: ${res.status} ${text}`);
  }
  // Expecting { url: "https://checkout.stripe.com/..." }
  return res.json();
}

// ---- API routes ----

// Serve the static demo page
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/me", (req, res) => {
  res.json({ userId: DEMO_USER_ID });
});

app.get("/api/joke", async (req, res) => {
  try {
    // 1) Ask Autumn if this user can use the feature
    const check = await autumnCheck({ userId: DEMO_USER_ID, featureKey: AUTUMN_FEATURE_KEY });
    if (!check.allowed) {
      // 2) Not allowed → create checkout session
      const { url } = await autumnCheckout({ userId: DEMO_USER_ID });
      return res.status(402).json({
        error: "upgrade_required",
        message: check.reason || "You’re out of credits.",
        checkoutUrl: url,
      });
    }

    // 3) Allowed → return a joke and track 1 credit
    const jokes = [
      "Why did the AI cross the road? To optimize the chicken.",
      "I asked my model to tell a joke. It replied, 'I’m still training.'",
      "Neural nets are like onions: lots of layers and they make you cry when they overfit.",
      "My prompt engineer told me a joke—sadly, the model took it literally."
    ];
    const joke = jokes[Math.floor(Math.random() * jokes.length)];

    await autumnTrack({ userId: DEMO_USER_ID, featureKey: AUTUMN_FEATURE_KEY, amount: 1 });

    res.json({ joke });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error", message: String(err.message || err) });
  }
});

app.get("/api/checkout", async (req, res) => {
  try {
    const { url } = await autumnCheckout({ userId: DEMO_USER_ID });
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "server_error", message: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`Autumn minimal demo running on http://localhost:${PORT}`);
});
