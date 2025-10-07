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

// --- Generic V5 private request ---
async function privateRequest(endpoint, params = {}, method = "GET") {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const apiKey = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_API_SECRET;

  // Body string depends on method
  let bodyStr = "";
  if (method === "GET" && Object.keys(params).length > 0) {
    bodyStr = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join("&");
  } else if (method === "POST") {
    bodyStr = JSON.stringify(params);
  }

  // Correct V5 signing
  const signPayload = timestamp + apiKey + recvWindow + bodyStr;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signPayload)
    .digest("hex");

  const headers = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };

  const url = `${BASE_URL}${endpoint}`;
  const res = await axios({
    method,
    url,
    headers,
    params: method === "GET" ? params : undefined,
    data: method === "POST" ? params : undefined,
  });

  return res.data;
}

// --- Balance (V5 unified account) ---
export async function getBalance() {
  const res = await privateRequest("/v5/account/wallet-balance", { accountType: "UNIFIED" }, "GET");

  if (!res.result || !res.result.list || res.result.list.length === 0) {
    console.warn("⚠️ No balance data returned");
    return 0;
  }

  const coins = res.result.list[0].coin || [];
  const usdtObj = coins.find(c => c.coin === "USDT");

  if (!usdtObj) {
    console.warn("⚠️ No USDT wallet found in balance response");
    return 0;
  }

  const bal = parseFloat(usdtObj.availableToWithdraw || usdtObj.walletBalance || 0);
  return isNaN(bal) ? 0 : bal;
}

// --- Place Order ---
export async function placeOrder(pair, side, entry, sl, tp, percent = 10) {
  try {
    const bal = await getBalance();
    console.log(`💰 Current USDT Balance: ${bal}`);

    if (bal <= 0) {
      console.warn("⚠️ No balance available.");
      return;
    }

    // Allocation
    const allocation = bal * (percent / 100);

    // Fetch live price
    const tickerRes = await axios.get(`${BASE_URL}/v5/market/tickers?category=linear&symbol=${pair}`);
    const price = parseFloat(tickerRes.data.result.list[0].lastPrice);

    const meta = PAIRS[pair];
    if (!meta) throw new Error(`Unsupported pair: ${pair}`);

    // Qty calc
    let qty = allocation / price;

    if (!qty || isNaN(qty)) {
      console.warn(`⚠️ Skipping ${pair} trade: could not calculate valid qty (allocation=${allocation}, price=${price})`);
      return;
    }

    qty = parseFloat(qty.toFixed(meta.qtyPrecision));

    // Safeguard for minQty
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
      takeProfit: tpRounded,
      stopLoss: slRounded,
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

