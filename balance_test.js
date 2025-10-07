// balance_test.js
import dotenv from "dotenv";
import crypto from "crypto";
import fetch from "node-fetch";

dotenv.config();

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = "https://api.bybit.com";

// === Helpers ===
function getSignature(params, secret) {
  const orderedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", secret)
    .update(orderedParams)
    .digest("hex");
}

async function bybitRequest(endpoint, params = {}, method = "GET") {
  const timestamp = Date.now().toString();
  const baseParams = { api_key: API_KEY, timestamp, ...params };
  baseParams.sign = getSignature(baseParams, API_SECRET);

  const url = `${BASE_URL}${endpoint}?${new URLSearchParams(baseParams)}`;

  const res = await fetch(url, { method });
  return res.json();
}

// === Unified Balance ===
async function getUnifiedBalance() {
  const data = await bybitRequest("/v5/account/wallet-balance", {
    accountType: "UNIFIED",
  });

  const coins = data.result.list[0].coin;

  console.log("\n=== UNIFIED WALLET ===");
  coins.forEach((c) => {
    console.log(
      `${c.coin}: Balance=${c.walletBalance}, Equity=${c.equity}, USD Value=${c.usdValue}`
    );
  });

  // Extract USDT
  const usdt = coins.find((c) => c.coin === "USDT");
  return parseFloat(usdt?.walletBalance || "0");
}

// === Run Test ===
(async () => {
  console.log("=== DigiBot Balance Check ===");
  const usdtBalance = await getUnifiedBalance();
  console.log(`\n💰 Available USDT: ${usdtBalance}`);
})();











