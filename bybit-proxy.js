import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

// === TEST ROUTE ===
app.get("/", (req, res) => {
  res.send("✅ Bybit Testnet Proxy is running");
});

// === KLINES ROUTE (TESTNET) ===
app.get("/klines", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", interval = "1", category = "spot" } = req.query;

    // ✅ TESTNET endpoint (not mainnet)
    const url = `https://api-testnet.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=${interval}`;

    console.log("🔗 Fetching from:", url);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.result) {
      console.log("⚠️ Unexpected data:", data);
      return res.status(500).json({ error: "Invalid response from Bybit Testnet" });
    }

    res.json(data);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 Bybit Testnet proxy running on port ${PORT}`));
