import express from "express";
import cors from "cors";
import { Autumn } from "autumn-js";
import { autumnHandler } from "autumn-js/express";
import "dotenv/config";

const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY });

app.post("/api/checkout", async (req, res) => {
  try {
    const { data } = await autumn.checkout({
      customer_id: "demo-user-456", // or a fresh ID for testing
      product_id: "pro",
    });
    console.log("checkout data:", data);
    if (data?.url) {
      return res.json({ url: data.url });
    }
    res.status(400).json({ error: "No checkout URL", data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "checkout_failed" });
  }
});


// --- mount Autumn handler ---
app.use(
  "/api/autumn",
  autumnHandler({
    secretKey: process.env.AUTUMN_SECRET_KEY,
    identify: () => {
      // THIS MUST RETURN A STRING
      return "demo-user-456";
    },
  })
);

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`server on :${port}`));

