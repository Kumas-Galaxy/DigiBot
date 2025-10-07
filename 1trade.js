// trade.js
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const IS_TESTNET = process.env.BYBIT_TESTNET === "true";

const BASE_URL = IS_TESTNET
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";

// Helper: create signed headers
function signRequest(params) {
  const qs = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac("sha256", API_SECRET)
    .update(qs)
    .digest("hex");
  return { ...params, sign: signature };
}

// Get available USDT balance
export async function getBalance() {
  const params = {
    api_key: API_KEY,
    timestamp: Date.now(),
    recv_window: 5000,
  };

  const signed = signRequest(params);
  const res = await axios.get(`${BASE_URL}/v2/private/wallet/balance`, {
    params: signed,
  });

  return parseFloat(res.data.result.USDT.available_balance);
}

// Place market order with SL/TP
export async function placeOrder(pair, side, entry, sl, tp) {
  try {
    // 1) Get balance
    const balance = await getBalance();
    const riskPct = 0.10; // 10%
    const usdSize = balance * riskPct;

    // 2) Convert to quantity
    const qty = (usdSize / entry).toFixed(3); // adjust decimals per pair

    // 3) Create params
    const params = {
      api_key: API_KEY,
      symbol: pair,
      side, // "Buy" or "Sell"
      order_type: "Market",
      qty,
      time_in_force: "GoodTillCancel",
      reduce_only: false,
      close_on_trigger: false,
      stop_loss: sl.toFixed(2),
      take_profit: tp.toFixed(2),
      timestamp: Date.now(),
      recv_window: 5000,
    };

    // 4) Sign & send
    const signed = signRequest(params);
    const res = await axios.post(`${BASE_URL}/v2/private/order/create`, null, {
      params: signed,
    });

    if (res.data.ret_code === 0) {
      console.log(`✅ Order placed: ${side} ${qty} ${pair} @ ${entry}`);
    } else {
      console.error("❌ Order failed:", res.data);
    }
  } catch (err) {
    console.error("❌ Order error:", err.response?.data || err.message);
  }
}
