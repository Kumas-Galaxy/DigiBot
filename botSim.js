import dotenv from "dotenv";
import axios from "axios";
import technicalindicators from "technicalindicators";

dotenv.config();

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = "https://api-testnet.bybit.com"; // Testnet only

const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];

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
  if (closes.length < 22) return { action: "WAIT", rsi: "-", fast: "-", slow: "-" };

  const fastEMA = calcEMA(closes, 9);
  const slowEMA = calcEMA(closes, 21);
  const rsi = calcRSI(closes, 14);

  const lastRSI = rsi[rsi.length - 1];
  const fastNow = fastEMA[fastEMA.length - 1];
  const slowNow = slowEMA[slowEMA.length - 1];
  const fastPrev = fastEMA[fastEMA.length - 2];
  const slowPrev = slowEMA[slowEMA.length - 2];
  const price = closes[closes.length - 1];

  let action = "WAIT";

  // Cross confirmation
  const crossedUp = fastPrev < slowPrev && fastNow > slowNow;
  const crossedDown = fastPrev > slowPrev && fastNow < slowNow;

  // Noise filter: avoid chop zone
  const inChop = Math.abs((price - slowNow) / slowNow) < 0.002;

  if (crossedUp && lastRSI < 70 && !inChop) action = "BUY";
  else if (crossedDown && lastRSI > 30 && !inChop) action = "SELL";

  return { action, rsi: lastRSI.toFixed(2), fast: fastNow.toFixed(2), slow: slowNow.toFixed(2), price };
}

// ===== Main Loop =====
async function runBot() {
  console.clear();
  console.log("🤖 DigiBot (TESTNET) - EMA+RSI Hybrid\n");

  for (const symbol of PAIRS) {
    try {
      const closes = await fetchKlines(symbol);
      const decision = decide(symbol, closes);
      console.log(
        `${symbol.padEnd(8)} | Price: ${decision.price} | RSI: ${decision.rsi} | FastEMA: ${decision.fast} | SlowEMA: ${decision.slow} | Action: ${decision.action}`
      );
    } catch (err) {
      console.log(`${symbol} fetch error:`, err.message);
    }
  }

  console.log("\n💰 Wallet: 1000 USDT | 🔒 Locked Profit: 0.00\n");
}

// Run every 1m
setInterval(runBot, 60 * 1000);
runBot();
