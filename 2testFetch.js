// digibot.js
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";
import chalk from "chalk";

dotenv.config();

const USE_TESTNET = process.env.BYBIT_TESTNET === "true";
const API_KEY = USE_TESTNET ? process.env.BYBIT_TESTNET_KEY : process.env.BYBIT_API_KEY;
const API_SECRET = USE_TESTNET ? process.env.BYBIT_TESTNET_SECRET : process.env.BYBIT_API_SECRET;
const BASE_URL = USE_TESTNET ? "https://api-testnet.bybit.com" : "https://api.bybit.com";

const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const INTERVAL = 60 * 1000;
const ALLOC_PER_TRADE = 50;
const POSITION_SIZE = {};
let walletBalance = 1000;
let lockedProfit = 0;

// === Signing Helper ===
function signRequest(params) {
  const ordered = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  return crypto.createHmac("sha256", API_SECRET).update(ordered).digest("hex");
}

// === Klines ===
async function getKlines(symbol, interval = "1") {
  try {
    const url = `${BASE_URL}/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=200`;
    const res = await axios.get(url);
    return res.data.result.list.reverse().map(c => parseFloat(c[4]));
  } catch (err) {
    console.error(`❌ Fetch klines ${symbol}`, err.message);
    return [];
  }
}

// === Indicators ===
function EMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function computeRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const RS = gains / (losses || 1);
  return 100 - (100 / (1 + RS));
}

// === Orders ===
async function createSpotOrder(symbol, side, qty) {
  const endpoint = "/v5/order/create";
  const timestamp = Date.now();
  const params = {
    category: "spot",
    symbol,
    side,
    orderType: "Market",
    qty,
    timestamp,
    api_key: API_KEY,
  };
  params.sign = signRequest(params);
  try {
    const res = await axios.post(BASE_URL + endpoint, null, { params });
    return res.data;
  } catch (err) {
    return { error: err.response?.data || err.message };
  }
}

// === Trading Logic ===
async function tradeDecision(symbol) {
  const closes = await getKlines(symbol);
  if (!closes.length) return { symbol, action: "NONE" };

  const rsi = computeRSI(closes);
  const fastEMA = EMA(closes, 9);
  const slowEMA = EMA(closes, 21);
  const price = closes.at(-1);
  let action = "WAIT";
  let pnl = 0;

  if (POSITION_SIZE[symbol]) {
    const entry = POSITION_SIZE[symbol].entry;
    pnl = ((price - entry) / entry) * 100;

    // Exit rules
    if (rsi > 70 || fastEMA < slowEMA || price < entry * 0.97) {
      const { qty, entry } = POSITION_SIZE[symbol];
      const profit = (price - entry) * qty;
      walletBalance += price * qty;
      lockedProfit += profit;
      delete POSITION_SIZE[symbol];
      await createSpotOrder(symbol, "Sell", qty);
      action = "SELL";
    } else {
      action = "HOLD";
    }
  } else {
    // Entry rules
    if (fastEMA > slowEMA && rsi < 40) {
      const qty = (ALLOC_PER_TRADE / price).toFixed(6);
      POSITION_SIZE[symbol] = { qty: parseFloat(qty), entry: price };
      walletBalance -= ALLOC_PER_TRADE;
      await createSpotOrder(symbol, "Buy", qty);
      action = "BUY";
    }
  }

  return { symbol, price, rsi: rsi?.toFixed(2), fastEMA: fastEMA?.toFixed(2), slowEMA: slowEMA?.toFixed(2), action, pnl };
}

// === Loop ===
async function loop() {
  console.clear();
  console.log(`🤖 DigiBot (${USE_TESTNET ? "TESTNET" : "MAINNET"}) - Hybrid MA+RSI`);
  console.log("Symbol | Price | RSI | FastEMA | SlowEMA | Action | PnL%");

  let totalEquity = walletBalance;

  for (const pair of PAIRS) {
    const d = await tradeDecision(pair);

    let pnlColor = "";
    if (d.pnl > 0) pnlColor = chalk.green(`${d.pnl.toFixed(2)}%`);
    else if (d.pnl < 0) pnlColor = chalk.red(`${d.pnl.toFixed(2)}%`);
    else pnlColor = "-";

    if (POSITION_SIZE[pair]) {
      const { qty } = POSITION_SIZE[pair];
      totalEquity += d.price * qty;
    }

    console.log(
      `${d.symbol.padEnd(6)} | ${d.price?.toFixed(2) || "-"} | ${d.rsi || "-"} | ${d.fastEMA || "-"} | ${d.slowEMA || "-"} | ${d.action.padEnd(5)} | ${pnlColor}`
    );
  }

  console.log("\n💰 Wallet:", walletBalance.toFixed(2), "USDT");
  console.log("📊 Equity:", totalEquity.toFixed(2), "USDT");
  console.log("🔒 Locked Profit:", lockedProfit.toFixed(2), "USDT");
  console.log("⏳ Next cycle in 1m...");
}

setInterval(loop, INTERVAL);
loop();
