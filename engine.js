import axios from "axios";
import dotenv from "dotenv";
import Table from "cli-table3";

dotenv.config();

// Config
const TESTNET = process.env.BYBIT_TESTNET === "true";
const WALLET_START = 10000;
const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const INTERVAL = "1m"; // candle interval
const LIMIT = 50;      // number of candles

// State
let wallet = WALLET_START;
let lockedVault = 0;
let equity = WALLET_START;
let history = {}; // to keep trend for each pair

PAIRS.forEach(sym => history[sym] = []);

// ===== Utility =====
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    let diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (gains + losses === 0) return 50;
  return 100 - 100 / (1 + gains / losses);
}

function trendString(sym, lastClose) {
  const hist = history[sym];
  hist.push(lastClose);
  if (hist.length > 10) hist.shift(); // keep last 10
  return hist.map(p => p >= lastClose ? "🟩" : "🟥").join("");
}

// ===== Fetch Klines =====
async function fetchKlines(symbol) {
  try {
    const url = TESTNET
      ? `https://api-testnet.bybit.com/spot/quote/v1/kline?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`
      : `https://api.bybit.com/spot/quote/v1/kline?symbol=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`;
    const res = await axios.get(url);
    return res.data.result.map(k => parseFloat(k.close));
  } catch (err) {
    console.error(`fetchKlines failed for ${symbol}:`, err.response?.status || err.message);
    return [];
  }
}

// ===== Main Dashboard =====
async function updateDashboard() {
  const table = new Table({
    head: ["Symbol", "Action", "Price", "RSI", "Allocated", "Wallet", "LockedVault", "Equity", "PnL %", "Trend"]
  });

  for (let sym of PAIRS) {
    const closes = await fetchKlines(sym);
    const lastClose = closes.length ? closes[closes.length - 1] : 0;
    const rsi = calculateRSI(closes);

    // Demo action logic (simple RSI based)
    let action = "HOLD";
    let allocated = 0;
    if (rsi < 30) {
      action = "BUY";
      allocated = wallet * 0.05; // 5% allocation
    } else if (rsi > 70) {
      action = "SELL";
      allocated = wallet * 0.05;
    }

    // PnL mock (for demo)
    const pnl = allocated ? ((lastClose - lastClose) / lastClose) * 100 : 0;
    equity = wallet + pnl;
    const trend = trendString(sym, lastClose);

    table.push([
      sym,
      action,
      lastClose.toFixed(2),
      rsi.toFixed(2),
      allocated.toFixed(2),
      wallet.toFixed(2),
      lockedVault.toFixed(2),
      equity.toFixed(2),
      pnl.toFixed(2) + "%",
      trend
    ]);
  }

  console.clear();
  console.log(table.toString());
}

// ===== Loop =====
async function mainLoop() {
  await updateDashboard();
  setTimeout(mainLoop, 5000); // refresh every 5s
}

mainLoop();
