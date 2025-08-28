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

// ====== CONFIG ======
const DEMO_USER_ID = "demo-user-999"; // permanently fixed
const FEATURE_ID   = process.env.AUTUMN_FEATURE_ID || "joke_feature";
const PRODUCT_ID   = process.env.AUTUMN_PRODUCT_ID || "pro"; // subscription fallback

// Top-up packs configured via ENV. Prefer PRICE_ID; fallback PRODUCT_ID.
function readPack(prefix, label, credits) {
  const priceId   = process.env[`${prefix}_PRICE_ID`] || "";
  const productId = process.env[`${prefix}_PRODUCT_ID`] || "";
  if (!priceId && !productId) return null; // not configured
  return { key: prefix.replace(/^AUTUMN_TOPUP_/, "").toLowerCase(), label, credits, priceId, productId };
}
const PACKS = [
  readPack("AUTUMN_TOPUP_SMALL",  "Small Pack",  100),
  readPack("AUTUMN_TOPUP_MEDIUM", "Medium Pack", 500),
  readPack("AUTUMN_TOPUP_LARGE",  "Large Pack",  2000),
].filter(Boolean);

function pickUrl(data) {
  return (
    data?.url ||
    data?.checkout_url ||
    data?.hosted_url ||
    data?.session_url ||
    data?.portal_url ||
    data?.billing_url ||
    null
  );
}

function originFromReq(req) {
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || "http").toString();
  return `${proto}://${req.headers.host}`;
}

// ====== STATIC + WHOAMI ======
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/me", (_req, res) => res.json({ userId: DEMO_USER_ID }));

// ====== CREDITS (robust reader) ======
async function getRemainingCredits(customerId, featureId) {
  try {
    // Prefer a balance endpoint if available on your SDK
    if (autumn.balances?.get) {
      const { data, error } = await autumn.balances.get({ customer_id: customerId, feature_id: featureId });
      if (!error && typeof data?.remaining === "number") return data.remaining;
    }
    // Fallback: customers.get shapes
    const { data, error } = await autumn.customers.get({ customer_id: customerId });
    if (error) throw error;

    const arr = Array.isArray(data?.features) ? data.features : null;
    if (arr?.length) {
      const item = arr.find(f => f?.id === featureId || f?.feature_id === featureId);
      if (item && typeof item.remaining === "number") return item.remaining;
    }
    const bal = data?.balances?.[featureId];
    if (bal && typeof bal.remaining === "number") return bal.remaining;

    if (data?.credits?.[featureId]?.remaining != null) return Number(data.credits[featureId].remaining);
    if (data?.quota?.[featureId]?.remaining   != null) return Number(data.quota[featureId].remaining);
  } catch (e) {
    console.error("[getRemainingCredits] failed:", e?.message || e);
  }
  return null;
}

app.get("/api/credits", async (_req, res) => {
  const remaining = await getRemainingCredits(DEMO_USER_ID, FEATURE_ID);
  res.json({ remaining });
});

// ====== JOKE (consumes 1 credit) ======
app.get("/api/joke", async (_req, res) => {
  try {
    const { data: checkData, error: checkErr } = await autumn.check({
      customer_id: DEMO_USER_ID,
      feature_id: FEATURE_ID,
    });
    if (checkErr) {
      return res.status(500).json({ error: "autumn_check_failed", message: checkErr.message || String(checkErr) });
    }

    if (!checkData?.allowed) {
      // Subscription checkout (optional fallback)
      const { data: checkoutData, error: checkoutErr } = await autumn.checkout({
        customer_id: DEMO_USER_ID,
        product_id: PRODUCT_ID,
      });
      if (checkoutErr) {
        return res.status(402).json({ error: "upgrade_required", message: checkData?.reason || "Out of credits." });
      }
      return res.status(402).json({
        error: "upgrade_required",
        message: checkData?.reason || "Out of credits.",
        checkoutUrl: pickUrl(checkoutData) || null,
      });
    }

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

    const remaining = await getRemainingCredits(DEMO_USER_ID, FEATURE_ID);
    res.json({ joke, remaining });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
});

// ====== TOP-UP PACKS (one-time payments) ======
app.get("/api/topup/options", (_req, res) => {
  res.json({ options: PACKS.map(p => ({ key: p.key, label: p.label, credits: p.credits })) });
});

app.post("/api/topup/checkout", async (req, res) => {
  try {
    const key = (req.query.pack || req.body?.pack || "").toString();
    const pack = PACKS.find(p => p.key === key);
    if (!pack) {
      return res.status(404).json({ error: "unknown_pack", message: `Pack "${key}" is not configured` });
    }

    const origin = originFromReq(req);
    const success_url = `${origin}/?topup=success&pack=${encodeURIComponent(pack.key)}`;
    const cancel_url  = `${origin}/?topup=cancel&pack=${encodeURIComponent(pack.key)}`;

    const tryCheckout = async (payload) => {
      const { data, error } = await autumn.checkout(payload);
      if (error) return { error };
      return { data, url: pickUrl(data) };
    };

    // Prefer price-based checkout
    let out = null;
    if (pack.priceId) {
      out = await tryCheckout({
        customer_id: DEMO_USER_ID,
        price_id: pack.priceId,
        mode: "payment",
        success_url,
        cancel_url,
      });
    }
    // Fallback to product-based
    if ((!out || !out.url) && pack.productId) {
      out = await tryCheckout({
        customer_id: DEMO_USER_ID,
        product_id: pack.productId,
        mode: "payment",
        success_url,
        cancel_url,
      });
    }

    if (!out || out.error) {
      console.error("[topup checkout] error:", out?.error);
      return res.status(500).json({ error: "autumn_checkout_failed", message: out?.error?.message || "Checkout creation failed" });
    }
    if (!out.url) {
      console.warn("[topup checkout] No URL returned. Data keys:", Object.keys(out.data || {}));
      return res.status(500).json({ error: "no_checkout_url", message: "Autumn did not return a redirect URL." });
    }

    res.json({ url: out.url });
  } catch (e) {
    res.status(500).json({ error: "topup_failed", message: String(e?.message || e) });
  }
});

// ====== SUBSCRIPTION CHECKOUT (fallback) ======
app.get("/api/checkout", async (_req, res) => {
  try {
    const { data, error } = await autumn.checkout({
      customer_id: DEMO_USER_ID,
      product_id: PRODUCT_ID,
    });
    if (error) return res.status(500).json({ error: "autumn_checkout_failed", message: error.message || String(error) });
    res.json({ url: pickUrl(data), data });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`Autumn demo running on http://localhost:${PORT}`);
});
