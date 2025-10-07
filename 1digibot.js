import dotenv from "dotenv";
import axios from "axios";
import technicalindicators from "technicalindicators";

dotenv.config();

const BASE_URL = "https://api-testnet.bybit.com";
const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const ALLOC_PER_TRADE = 100;

let wallet = 1000;
let lockedProfit = 0;
let openTrades = {}; // { symbol: { side, entry, alloc } }

// ===== Indicators =====
function calcEMA(prices, period) {
  return technicalindicators.EMA.calculate({ period, values: prices });
}
function calcRSI(prices, period = 14) {
  return technicalindicators.RSI.calculate({ period, values: prices });
}

// ===== Market Data Fetch =====
async function fetchKlines(symbol, limit = 50) {
  const res = await axios.get(`${BASE_URL}/v5/market/kline`, {
    params: { category: "spot", symbol, interval: "1", limit },
  });
  return res.data.result.list.reverse().map(c => parseFloat(c[4])); // close prices
}

// ===== Decision Engine =====
function decide(symbol, closes) {
  if (closes.length < 22) return { action: "WAIT", rsi: "-", fast: "-", slow: "-", price: closes.at(-1) };

  const fastEMA = calcEMA(closes, 9);
  const slowEMA = calcEMA(closes, 21);
  const rsi = calcRSI(closes, 14);

  const lastRSI = rsi[rsi.length - 1];
  const fastNow = fastEMA.at(-1);
  const slowNow = slowEMA.at(-1);
  const fastPrev = fastEMA.at(-2);
  const slowPrev = slowEMA.at(-2);
  const price = closes.at(-1);

  let action = "WAIT";

  // EMA Cross
  const crossedUp = fastPrev < slowPrev && fastNow > slowNow;
  const crossedDown = fastPrev > slowPrev && fastNow < slowNow;

  // Entry rules
  if (crossedUp && lastRSI < 70) action = "BUY";
  else if (crossedDown && lastRSI > 30) action = "SELL";
  else if (lastRSI < 30) action = "BUY";    // RSI oversold
  else if (lastRSI > 70) action = "SELL";   // RSI overbought

  return { action, rsi: lastRSI.toFixed(2), fast: fastNow.toFixed(2), slow: slowNow.toFixed(2), price };
}

// ===== Trade Engine =====
function updateTrades(symbol, decision) {
  const trade = openTrades[symbol];
  let floatingPnL = 0, pnlPercent = 0;

  if (trade) {
    if (trade.side === "BUY") {
      floatingPnL = (decision.price - trade.entry) / trade.entry * trade.alloc;
    } else {
      floatingPnL = (trade.entry - decision.price) / trade.entry * trade.alloc;
    }
    pnlPercent = (floatingPnL / trade.alloc) * 100;

    // Exit conditions
    if (pnlPercent >= 1 || pnlPercent <= -0.5) {
      lockedProfit += floatingPnL;
      wallet += trade.alloc + floatingPnL;
      delete openTrades[symbol];
      return { floatingPnL: 0, pnlPercent: 0, closed: true };
    }
    if (trade.side === "BUY" && decision.rsi > 70) {
      lockedProfit += floatingPnL;
      wallet += trade.alloc + floatingPnL;
      delete openTrades[symbol];
      return { floatingPnL: 0, pnlPercent: 0, closed: true };
    }
    if (trade.side === "SELL" && decision.rsi < 30) {
      lockedProfit += floatingPnL;
      wallet += trade.alloc + floatingPnL;
      delete openTrades[symbol];
      return { floatingPnL: 0, pnlPercent: 0, closed: true };
    }
  }

  // Entry conditions
  if (decision.action === "BUY" && !trade) {
    openTrades[symbol] = { side: "BUY", entry: decision.price, alloc: ALLOC_PER_TRADE };
    wallet -= ALLOC_PER_TRADE;
  } else if (decision.action === "SELL" && !trade) {
    openTrades[symbol] = { side: "SELL", entry: decision.price, alloc: ALLOC_PER_TRADE };
    wallet -= ALLOC_PER_TRADE;
  }

  return { floatingPnL, pnlPercent };
}

// ===== Dashboard =====
function colorPnL(value) {
  if (value > 0) return `\x1b[32m${value.toFixed(2)}\x1b[0m`; // green
  if (value < 0) return `\x1b[31m${value.toFixed(2)}\x1b[0m`; // red
  return value.toFixed(2);
}

// ===== Main Loop =====
async function runBot() {
  console.clear();
  console.log("🤖 DigiBot (TESTNET) - EMA+RSI Hybrid with TP/SL\n");
  console.log("Symbol    | Price      | RSI  | EMA9      | EMA21     | Action | PnL%   | Floating  | Locked");

  let totalFloating = 0;
  for (const symbol of PAIRS) {
    try {
      const closes = await fetchKlines(symbol);
      const decision = decide(symbol, closes);
      const { floatingPnL, pnlPercent } = updateTrades(symbol, decision);

      totalFloating += floatingPnL;

      console.log(
        `${symbol.padEnd(8)} | ${decision.price.toFixed(2).padEnd(10)} | ${decision.rsi.padEnd(4)} | ${decision.fast.padEnd(9)} | ${decision.slow.padEnd(9)} | ${decision.action.padEnd(6)} | ${colorPnL(pnlPercent)}% | ${colorPnL(floatingPnL)} | ${colorPnL(lockedProfit)}`
      );
    } catch (err) {
      console.log(`${symbol} fetch error:`, err.message);
    }
  }

  console.log(`\n💰 Wallet: ${wallet.toFixed(2)} USDT`);
  console.log(`📊 Equity: ${(wallet + totalFloating + lockedProfit).toFixed(2)} USDT`);
  console.log(`🔒 Locked Profit: ${colorPnL(lockedProfit)} USDT`);
  console.log("⏳ Next cycle in 1m...");
}

// Run every 1m
setInterval(runBot, 60 * 1000);
runBot();
