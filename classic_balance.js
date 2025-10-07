import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;

function signRequest(query) {
  return crypto
    .createHmac("sha256", API_SECRET)
    .update(query)
    .digest("hex");
}

async function getClassicBalance() {
  const timestamp = Date.now().toString();
  const query = `api_key=${API_KEY}&timestamp=${timestamp}`;
  const sign = signRequest(query);

  try {
    const res = await axios.get(
      `https://api.bybit.com/v2/private/wallet/balance?${query}&sign=${sign}`
    );

    console.log("✅ Raw Balance Response:", res.data);

    // For spot/classic accounts
    const assets = res.data.result?.spot?.assets || [];
    if (assets.length === 0) {
      console.log("⚠️ No assets found in Classic Spot Wallet.");
      return;
    }

    // Print all balances
    assets.forEach(asset => {
      console.log(
        `💰 ${asset.coin}: walletBalance=${asset.walletBalance}, availableBalance=${asset.availableBalance}`
      );
    });

    // Specifically USDT
    const usdt = assets.find(item => item.coin === "USDT");
    console.log("💰 USDT Balance:", usdt ? usdt.walletBalance : "Not found");

  } catch (err) {
    console.error("❌ Balance Fetch Error:", err.response?.data || err.message);
  }
}

getClassicBalance();
