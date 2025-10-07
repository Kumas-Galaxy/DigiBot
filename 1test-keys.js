// test-keys.js
import dotenv from "dotenv";
import { getBalance, placeOrder } from "./trade.js";

dotenv.config();

(async () => {
  try {
    console.log("🔑 Testing API connectivity...");

    // Step 1: Check balance
    const bal = await getBalance();
    console.log("✅ API working, USDT Balance:", bal);

    // Step 2: Only test order if balance > 0
    if (bal > 0) {
      const pair = "BTCUSDT";
      const side = "Buy";
      const entry = 50000; // placeholder
      const sl = entry * 0.99;
      const tp = entry * 1.01;

      console.log("🚀 Sending test order (about 1 USDT worth)...");
      await placeOrder(pair, side, entry, sl, tp, 1); // force 1 USDT sizing
      console.log("✅ Test order attempt finished (check Bybit account)");
    } else {
      console.log("⚠️ No USDT balance found, skipping test order.");
    }
  } catch (err) {
    console.error("❌ API error:", err);
  }
})();
