import dotenv from "dotenv";
import axios from "axios";
import technicalindicators from "technicalindicators";

dotenv.config();

const BASE_URL = "https://api-testnet.bybit.com"; // Testnet only
const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];

// ===== Bot State =====
let wallet = 1000.0;         // USDT balance
let lockedProfit = 0.0;      // Harvested profits
let positions = {};          // Active positions per symbol

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
  if (closes.length < 22) return { action: "WAIT", price: "-", rsi: "-", fast: "-", slow: "-" };

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

  const crossedUp = fastPrev < slowPrev && fastNow > slowNow;
  const crossedDown = fastPrev > slowPrev && fastNow < slowNow;
  const inChop = Math.abs((price - slowNow) / slowNow) < 0.002;

  if (crossedUp && lastRSI < 70 && !inChop) action = "BUY";
  else if (crossedDown && lastRSI > 30 && !inChop) action = "SELL";

  return { action, rsi: lastRSI.toFixed(2), fast: fastNow.toFixed(2), slow: slowNow.toFixed(2), price };
}

// ===== Trailing Profit Harvest =====
function managePosition(symbol, decision) {
  let pos = positions[symbol];
  const price = decision.price;

  if (!pos && (decision.action === "BUY" || decision.action === "SELL")) {
    // Open position
    positions[symbol] = {
      side: decision.action,
      entry: price,
      stopLoss: null,
      qty: 100 / price, // $100 allocation per trade
    };
    wallet -= 100;
    console.log(`🚀 Opened ${decision.action} ${symbol} at ${price}`);
    return;
  }

  if (pos) {
    // Calculate PnL %
    let pnlPct = 0;
    if (pos.side === "BUY") {
      pnlPct = ((price - pos.entry) / pos.entry) * 100;
    } else {
      pnlPct = ((pos.entry - price) / pos.entry) * 100;
    }

    // Trailing stop logic
    if (pnlPct >= 2 && !pos.stopLoss) {
      pos.stopLoss = pos.entry; // Move stoploss to breakeven
    }

    if (pnlPct > 2) {
      if (pos.side === "BUY") {
        pos.stopLoss = Math.max(pos.stopLoss, price * 0.99); // trail 1% below
      } else {
        pos.stopLoss = Math.min(pos.stopLoss, price * 1.01); // trail 1% above
      }
    }

    // Check stop loss hit
    if ((pos.side === "BUY" && price <= pos.stopLoss) ||
        (pos.side === "SELL" && price >= pos.stopLoss)) {
      const profit = pos.qty * (price - pos.entry) * (pos.side === "BUY" ? 1 : -1);
      const pnlPctRealized = (profit / 100) * 100; // since we allocate $100 each trade

      wallet += 100 + profit;   // return capital + profit
      lockedProfit += profit;

      console.log(`💰 Closed ${pos.side} ${symbol} at ${price} | Profit: ${profit.toFixed(2)} USDT | PnL: ${pnlPctRealized.toFixed(2)}%`);
      delete positions[symbol];
    }
  }
}

// ===== Main Loop =====
async function runBot() {
  console.clear();
  console.log("🤖 DigiBot (TESTNET) - EMA+RSI with Trailing Profit Harvest\n");

  for (const symbol of PAIRS) {
    try {
      const closes = await fetchKlines(symbol);
      const decision = decide(symbol, closes);
      managePosition(symbol, decision);

      const pos = positions[symbol];
      console.log(
        `${symbol.padEnd(8)} | Price: ${decision.price} | RSI: ${decision.rsi} | Action: ${decision.action} | Position: ${pos ? pos.side : "None"} | SL: ${pos?.stopLoss?.toFixed(2) || "-"}`
      );
    } catch (err) {
      console.log(`${symbol} fetch error:`, err.message);
    }
  }

  console.log(`\n💰 Wallet: ${wallet.toFixed(2)} USDT | 🔒 Locked Profit: ${lockedProfit.toFixed(2)} USDT\n`);
}

// Run every 1 min
setInterval(runBot, 60 * 1000);
runBot();
