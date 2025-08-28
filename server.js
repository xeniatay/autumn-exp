// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Autumn as autumn } from "autumn-js";

dotenv.config();

if (!process.env.AUTUMN_SECRET_KEY) {
  throw new Error("Missing AUTUMN_SECRET_KEY in env");
}

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const FEATURE_ID = process.env.AUTUMN_FEATURE_ID || "joke_feature";
const PRODUCT_ID = process.env.AUTUMN_PRODUCT_ID || "pro";

// Demo user; replace with real auth session user id
const DEMO_USER_ID = "demo-user-123";

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/me", (req, res) => {
  res.json({ userId: DEMO_USER_ID });
});

/**
 * Try to read "remaining credits" for a specific feature from Autumn.
 * Different deployments/schemas may shape this differently, so we defensively probe a few shapes.
 */
async function getRemainingCredits(customerId, featureId) {
  try {
    // Prefer a single customer fetch if available
    const { data, error } = await autumn.customers.get({ customer_id: customerId });
    if (error) throw error;

    // Common shapes we might see:
    // 1) data.features: [{ id, remaining, limit, used }]
    const featureFromList = Array.isArray(data?.features)
      ? data.features.find(f => f?.id === featureId || f?.feature_id === featureId)
      : null;
    if (featureFromList && typeof featureFromList.remaining === "number") {
      return featureFromList.remaining;
    }

    // 2) data.balances: { [featureId]: { remaining, used, limit } }
    const bal = data?.balances?.[featureId];
    if (bal && typeof bal.remaining === "number") {
      return bal.remaining;
    }

    // 3) data.credits or data.quota keyed by feature
    if (data?.credits?.[featureId]?.remaining != null) {
      return data.credits[featureId].remaining;
    }
    if (data?.quota?.[featureId]?.remaining != null) {
      return data.quota[featureId].remaining;
    }
  } catch (e) {
    // Non-fatal: just return null if we can't read it
    console.error("[getRemainingCredits] failed:", e?.message || e);
  }
  return null; // unknown
}

app.get("/api/credits", async (req, res) => {
  const remaining = await getRemainingCredits(DEMO_USER_ID, FEATURE_ID);
  res.json({ remaining });
});

app.get("/api/joke", async (req, res) => {
  try {
    const { data: checkData, error: checkErr } = await autumn.check({
      customer_id: DEMO_USER_ID,
      feature_id: FEATURE_ID,
    });
    if (checkErr) {
      return res.status(500).json({ error: "autumn_check_failed", message: checkErr.message || String(checkErr) });
    }

    if (!checkData?.allowed) {
      const { data: checkoutData, error: checkoutErr } = await autumn.checkout({
        customer_id: DEMO_USER_ID,
        product_id: PRODUCT_ID,
      });
      if (checkoutErr) {
        return res.status(500).json({ error: "autumn_checkout_failed", message: checkoutErr.message || String(checkoutErr) });
      }
      return res.status(402).json({
        error: "upgrade_required",
        message: checkData?.reason || "You’re out of credits.",
        checkoutUrl: checkoutData?.url,
      });
    }

    // allowed → serve a joke and track 1
    const jokes = [
      "Why did the AI cross the road? To optimize the chicken.",
      "I asked my model for a joke; it said it’s still training.",
      "Neural nets have layers like onions—and sometimes they make you cry.",
      "My prompt engineer told me a joke; the model took it literally.",
    ];
    const joke = jokes[Math.floor(Math.random() * jokes.length)];

    const { error: trackErr } = await autumn.track({
      customer_id: DEMO_USER_ID,
      feature_id: FEATURE_ID,
      amount: 1,
      metadata: { source: "joke-demo" },
    });
    if (trackErr) console.error("Autumn track error:", trackErr);

    // after tracking, fetch updated remaining credits
    const remaining = await getRemainingCredits(DEMO_USER_ID, FEATURE_ID);

    res.json({ joke, remaining });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
});

app.get("/api/checkout", async (req, res) => {
  try {
    const { data, error } = await autumn.checkout({
      customer_id: DEMO_USER_ID,
      product_id: PRODUCT_ID,
    });
    if (error) return res.status(500).json({ error: "autumn_checkout_failed", message: error.message || String(error) });
    res.json({ url: data?.url, data });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`Autumn minimal demo running on http://localhost:${PORT}`);
});
