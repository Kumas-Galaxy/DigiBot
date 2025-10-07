require('dotenv').config();

const axios = require("axios");

const useTestnet = process.env.TESTNET === "true";
const baseUrl = useTestnet ? "https://api-testnet.bybit.com" : "https://api.bybit.com";

console.log(`🔑 Testing Bybit ${useTestnet ? "TESTNET" : "LIVE"} API connection...`);

(async () => {
  try {
    const res = await axios.get(baseUrl + "/v5/market/time");
    console.log("✅ API reachable:", res.data);
  } catch (err) {
    console.error("❌ API connection failed:", err.response?.data || err.message);
  }
})();
