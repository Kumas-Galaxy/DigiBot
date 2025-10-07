import dotenv from "dotenv";
import axios from "axios";
import technicalindicators from "technicalindicators";

dotenv.config();

const BASE_URL = "https://api-testnet.bybit.com"; // Testnet
const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];

// Wallet simulation
let wallet = 1000;          // in USDT
let positions = {};         // { BTCUSDT: { side, entry, qty, lockedProfit } }

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
  return res.data.result.list.reverse().map(c => parseFloat(c[4]));
}

// ===== Decision Engine =====
function decide(symbol, closes) {
  if (closes.length < 22) return { action: "WAIT" };

  const fastEMA = calcEMA(closes, 9);
  const slowEMA = calcEMA(closes, 21);
  const rsi = calcRSI(closes, 14);

  const lastRSI = rsi[rsi.length - 1];
  const fastNow = fastEMA[fastEMA.length - 1];
  const slowNow = slowEMA[slowEMA.length - 1];
  const fastPrev = fastEMA[fastEMA.length - 2];
  const slowPrev = slowEMA[slowEMA.length - 2];
  const price = closes[closes.length - 1];

  const crossedUp = fastPrev < slowPrev && fastNow > slowNow;
  const crossedDown = fastPrev > slowPrev && fastNow < slowNow;
  const inChop = Math.abs((price - slowNow) / slowNow) < 0.002;

  let action = "WAIT";
  if (crossedUp && lastRSI < 70 && !inChop) action = "BUY";
  else if (crossedDown && lastRSI > 30 && !inChop) action = "SELL";

  return { action, price, rsi: lastRSI.toFixed(2) };
}

// ===== Profit Locking Logic =====
function managePosition(symbol, price) {
  const pos = positions[symbol];
  if (!pos) return;

  const pnlPct = ((price - pos.entry) / pos.entry) * (pos.side === "BUY" ? 100 : -100);

  // Lock profit after +2% gain
  if (pnlPct >= 2 && pos.lockedProfit < pnlPct - 1) {
    pos.lockedProfit = pnlPct - 1; // lock 1% below current gain
    console.log(`🔒 Locked ${pos.lockedProfit.toFixed(2)}% profit on ${symbol}`);
  }

  // Stop out if price drops below locked profit
  if (pos.lockedProfit > 0 && pnlPct <= pos.lockedProfit) {
    console.log(`✅ Harvested profit on ${symbol} | Locked ${pos.lockedProfit.toFixed(2)}%`);
    wallet *= 1 + pos.lockedProfit / 100;
    delete positions[symbol];
  }
}

// ===== Main Loop =====
async function runBot() {
  console.clear();
  console.log("🤖 DigiBot (TESTNET) - EMA+RSI with Profit Locking\n");

  for (const symbol of PAIRS) {
    try {
      const closes = await fetchKlines(symbol);
      const { action, price, rsi } = decide(symbol, closes);

      // Manage existing position
      managePosition(symbol, price);

      // Entry logic
      if (action === "BUY" && !positions[symbol]) {
        positions[symbol] = { side: "BUY", entry: price, qty: 1, lockedProfit: 0 };
        console.log(`🟢 Entered LONG ${symbol} @ ${price}`);
      } else if (action === "SELL" && !positions[symbol]) {
        positions[symbol] = { side: "SELL", entry: price, qty: 1, lockedProfit: 0 };
        console.log(`🔴 Entered SHORT ${symbol} @ ${price}`);
      }

      console.log(
        `${symbol.padEnd(8)} | Price: ${price.toFixed(2)} | RSI: ${rsi} | Action: ${action} | Position: ${
          positions[symbol] ? positions[symbol].side : "None"
        }`
      );
    } catch (err) {
      console.log(`${symbol} fetch error:`, err.message);
    }
  }

  console.log(`\n💰 Wallet: ${wallet.toFixed(2)} USDT`);
}

// Run every 1m
setInterval(runBot, 60 * 1000);
runBot();
