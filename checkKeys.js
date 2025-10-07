// checkKeys.js
import dotenv from "dotenv";
import { RestClientV5 } from "bybit-api";

dotenv.config();

const client = new RestClientV5({
  key: process.env.API_KEY,
  secret: process.env.API_SECRET,
  testnet: process.env.BYBIT_MODE === "TESTNET",
});

(async () => {
  try {
    console.log("🔑 API Key:", process.env.API_KEY ? "Loaded ✅" : "Missing ❌");
    console.log("🌍 Mode:", process.env.BYBIT_MODE || "Not set ❌");

    // ✅ Correct method: fetch account info
    const accountInfo = await client.getAccountInfo();
    console.log("👤 Account Info:", JSON.stringify(accountInfo, null, 2));

    // ✅ Correct method: fetch unified wallet balance
    const balance = await client.getWalletBalance({ accountType: "UNIFIED" });
    console.log("💰 Wallet Balance:", JSON.stringify(balance, null, 2));
  } catch (err) {
    console.error("❌ Error:", err.message || err);
  }
})();
