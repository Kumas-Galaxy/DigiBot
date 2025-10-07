import axios from "axios";
import dotenv from "dotenv";
import Table from "cli-table3";

dotenv.config();

// ===== Symbols & Tracking =====
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const priceHistory = {};
symbols.forEach((s) => (priceHistory[s] = []));
let lockedVault = 0;
let simulatedWallet = 10000; // starting balance
let openPositions = [];

// ===== Helper Functions =====
function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateRSI(prices, period = 14) {
  if (prices.length <= period) return 0;
  let gains = 0,
    losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function trendBars(closes) {
  if (!closes || closes.length < 2) return "";
  return closes.slice(-10).map((c, i, arr) => (i === 0 ? "" : c > arr[i - 1] ? "█" : "▁")).join("");
}

// ===== Fetch Live Data =====
async function fetchKlines(symbol, limit = 50) {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=${limit}`;
    const res = await axios.get(url);
    return res.data.map((k) => ({ close: parseFloat(k[4]) }));
  } catch (err) {
    console.error("fetchKlines failed for", symbol, err.message);
    return [];
  }
}

// ===== Signal Generator =====
function generateSignals() {
  const signals = {};
  for (const sym of symbols) {
    const closes = priceHistory[sym].map((p) => p.close);
    const shortMA = calculateMA(closes, 5);
    const longMA = calculateMA(closes, 20);
    const rsi = calculateRSI(closes);
    const price = closes.at(-1) || 0;

    let action = "HOLD";
    if (shortMA && longMA) {
      if (shortMA > longMA && rsi < 70) action = "BUY";
      else if (shortMA < longMA && rsi > 30) action = "SELL";
    }

    signals[sym] = { action, rsi, price };
  }
  return signals;
}

// ===== Dashboard =====
function updateDashboard(signals) {
  const table = new Table({
    head: ["Symbol", "Action", "Entry", "SL", "TP", "RSI", "Allocated", "Available", "Wallet", "LockedVault", "Equity", "PnL %", "Trend"]
  });

  for (const sym of symbols) {
    const sig = signals[sym];
    const pos = openPositions.find((p) => p.symbol === sym);
    const allocated = pos?.allocatedQty || 0;
    const entry = pos?.entry || sig.price || 0;
    const sl = pos?.sl ?? "N/A";
    const tp = pos?.tp ?? "N/A";
    const pnl = pos?.unrealizedPnL || 0;
    const equity = simulatedWallet + lockedVault;
    const available = simulatedWallet - allocated;
    const pnlPercent = ((pnl / simulatedWallet) * 100).toFixed(2) + "%";
    const trend = trendBars(priceHistory[sym].map(p => p.close));

    table.push([
      sym,
      sig.action,
      typeof entry === "number" ? entry.toFixed(2) : entry,
      sl.toString(),
      tp.toString(),
      sig.rsi.toFixed(2),
      allocated.toFixed(3),
      available.toFixed(2),
      simulatedWallet.toFixed(2),
      lockedVault.toFixed(2),
      equity.toFixed(2),
      pnlPercent,
      trend
    ]);
  }

  console.clear();
  console.log(table.toString());
}

// ===== Main Loop =====
async function processSignals() {
  // fetch latest candles
  for (const sym of symbols) {
    const klines = await fetchKlines(sym);
    if (klines.length) priceHistory[sym] = klines;
  }

  // generate signals
  const signals = generateSignals();

  // simulate positions and PnL
  for (const sym of symbols) {
    const sig = signals[sym];
    let pos = openPositions.find((p) => p.symbol === sym);

    if (!pos && sig.action !== "HOLD") {
      pos = {
        symbol: sym,
        entry: sig.price,
        allocatedQty: 0.01 * simulatedWallet / sig.price,
        sl: sig.action === "BUY" ? sig.price * 0.995 : sig.price * 1.005,
        tp: sig.action === "BUY" ? sig.price * 1.015 : sig.price * 0.985,
        unrealizedPnL: 0
      };
      openPositions.push(pos);
    }

    if (pos) {
      // PnL = (entry - currentPrice) * quantity
      pos.unrealizedPnL = sig.action === "SELL"
        ? (pos.entry - sig.price) * pos.allocatedQty
        : (sig.price - pos.entry) * pos.allocatedQty;

      // lock profit
      if (pos.unrealizedPnL > 0) {
        lockedVault += pos.unrealizedPnL;
        simulatedWallet -= pos.unrealizedPnL;
        pos.unrealizedPnL = 0;
      }
    }
  }

  updateDashboard(signals);
}

// ===== Start Bot =====
setInterval(processSignals, 5000); // every 5 seconds
