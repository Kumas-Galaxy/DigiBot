// trade.js
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

const IS_TESTNET = process.env.BYBIT_TESTNET === "true";
const BASE_URL = IS_TESTNET
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";

// Pair metadata
const PAIRS = {
  BTCUSDT: { minQty: 0.001, pricePrecision: 1, qtyPrecision: 3 },
  ETHUSDT: { minQty: 0.01,  pricePrecision: 2, qtyPrecision: 3 },
  BNBUSDT: { minQty: 0.1,   pricePrecision: 2, qtyPrecision: 2 },
  LTCUSDT: { minQty: 0.1,   pricePrecision: 2, qtyPrecision: 2 },
  XRPUSDT: { minQty: 1,     pricePrecision: 4, qtyPrecision: 0 },
};

// Signing
function signRequest(params) {
  const orderedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join("&");
  return crypto
    .createHmac("sha256", process.env.BYBIT_API_SECRET)
    .update(orderedParams)
    .digest("hex");
}

// Private request
async function privateRequest(endpoint, params = {}, method = "GET") {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";

  const allParams = { api_key: process.env.BYBIT_API_KEY, timestamp, recvWindow, ...params };
  const sign = signRequest(allParams);

  const url = `${BASE_URL}${endpoint}?${Object.entries(allParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}&sign=${sign}`;

  const res = await axios({ method, url });
  return res.data;
}

// --- Balance ---
export async function getBalance() {
  const res = await privateRequest("/v2/private/wallet/balance", { coin: "USDT" });
  return parseFloat(res.result.USDT.available_balance || 0);
}

// --- Place Order ---
export async function placeOrder(pair, side, entry, sl, tp, percent = 10) {
  try {
    const bal = await getBalance();
    if (bal <= 0) {
      console.warn("⚠️ No balance available.");
      return;
    }

    const allocation = bal * (percent / 100);

    // Fetch price
    const tickerRes = await axios.get(`${BASE_URL}/v5/market/tickers?category=linear&symbol=${pair}`);
    const price = parseFloat(tickerRes.data.result.list[0].lastPrice);

    const meta = PAIRS[pair];
    if (!meta) throw new Error(`Unsupported pair: ${pair}`);

    // Qty calculation
    let qty = allocation / price;
    qty = parseFloat(qty.toFixed(meta.qtyPrecision));

    // --- SAFEGUARD: Skip if qty < minQty ---
    if (qty < meta.minQty) {
      console.warn(`⚠️ Skipping ${pair} trade: qty=${qty} < minQty=${meta.minQty}`);
      return;
    }

    const slRounded = sl.toFixed(meta.pricePrecision);
    const tpRounded = tp.toFixed(meta.pricePrecision);

    console.log(`📝 Preparing order: ${side} ${pair}, qty=${qty}, entry=${price}, SL=${slRounded}, TP=${tpRounded}`);

    const orderParams = {
      category: "linear",
      symbol: pair,
      side,
      orderType: "Market",
      qty,
      timeInForce: "GoodTillCancel",
      stopLoss: slRounded,
      takeProfit: tpRounded,
      reduceOnly: false,
      closeOnTrigger: false,
    };

    const res = await privateRequest("/v5/order/create", orderParams, "POST");

    if (res.retCode === 0) {
      console.log(`✅ Order placed: ${pair} ${side}, qty=${qty}`);
    } else {
      console.error("❌ Order failed:", res);
    }
  } catch (err) {
    console.error("❌ Trade error:", err.response?.data || err.message);
  }
}
