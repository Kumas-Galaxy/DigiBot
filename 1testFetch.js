import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// ======================
// CONFIG
// ======================
const IS_TESTNET = process.env.BYBIT_TESTNET === "true";

const API_KEY = IS_TESTNET ? process.env.BYBIT_TESTNET_KEY : process.env.BYBIT_API_KEY;
const API_SECRET = IS_TESTNET ? process.env.BYBIT_TESTNET_SECRET : process.env.BYBIT_API_SECRET;

const BASE_URL = IS_TESTNET ? "https://api-testnet.bybit.com" : "https://api.bybit.com";

console.log(`🔑 Using ${IS_TESTNET ? "TESTNET" : "MAINNET"} endpoint: ${BASE_URL}`);

// ======================
// SIGN FUNCTION (V5 spec)
// ======================
function signRequest(timestamp, apiKey, recvWindow, body, secret) {
  const bodyStr = body ? JSON.stringify(body) : "";
  const preSign = timestamp + apiKey + recvWindow + bodyStr;
  return crypto.createHmac("sha256", secret).update(preSign).digest("hex");
}

// ======================
// CREATE SPOT ORDER
// ======================
async function createSpotOrder(symbol, side, qty, price) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";

  const body = {
    category: "spot",
    symbol,
    side,                // "Buy" or "Sell"
    orderType: "Limit",  // or "Market"
    qty: qty.toString(),
    price: price.toString(),
    timeInForce: "GTC"
  };

  const sign = signRequest(timestamp, API_KEY, recvWindow, body, API_SECRET);

  try {
    const response = await axios.post(`${BASE_URL}/v5/order/create`, body, {
      headers: {
        "X-BAPI-API-KEY": API_KEY,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": sign,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ Spot Order Response:", response.data);
  } catch (error) {
    console.error("❌ Error placing order:", error.response?.data || error.message);
  }
}

// ======================
// RUN EXAMPLE
// ======================
createSpotOrder("BTCUSDT", "Buy", 0.001, 25000);
