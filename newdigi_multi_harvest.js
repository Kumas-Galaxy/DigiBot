/**
 * 🤖 DigiBot (LIVE/TESTNET)
 * EMA + RSI with USD-based trailing profit lock
 * Supports modes: SCALP | HEDGE | SWING
 * No reinvestment — profits remain in wallet.
 */

import Bybit from "bybit-api";
import technicalindicators from "technicalindicators";
import Table from "cli-table3";

const client = new Bybit({
  key: process.env.BYBIT_API_KEY,
  secret: process.env.BYBIT_API_SECRET,
  testnet: process.env.BYBIT_TESTNET === "true",
});

// === CONFIGURATION ===
const MODE = "HEDGE"; // Options: SCALP | HEDGE | SWING
const PAIRS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const INTERVAL = "1h";
const CANDLE_LIMIT = 100;
const ALLOCATION = 200; // per pair (USDT)

const modeConfig = {
  SCALP: { fastEMA: 9, slowEMA: 21, rsiBuy: 55, rsiSell: 45, lockUsd: 0.5 },
  HEDGE: { fastEMA: 12, slowEMA: 26, rsiBuy: 60, rsiSell: 40, lockUsd: 1.0 },
  SWING: { fastEMA: 20, slowEMA: 50, rsiBuy: 65, rsiSell: 35, lockUsd: 2.0 },
};

const { fastEMA, slowEMA, rsiBuy, rsiSell, lockUsd } = modeConfig[MODE];
const modeEmoji = MODE === "SCALP" ? "⚡" : MODE === "HEDGE" ? "🛡️" : "📈";

// === STATE ===
let wallet = 1000;
let positions = {};
let lockedProfit = 0;

// === UTILS ===
async function getCandles(symbol) {
  const res = await client.getKline({ category: "spot", symbol, interval: INTERVAL, limit: CANDLE_LIMIT });
  const candles = res.result.list.reverse();
  return candles.map((c) => parseFloat(c[4])); // close prices
}

function calcEMA(data, period) {
  return technicalindicators.EMA.calculate({ period, values: data });
}

function calcRSI(data, period = 14) {
  return technicalindicators.RSI.calculate({ period, values: data });
}

// === CORE LOGIC ===
async function analyzePair(symbol) {
  const prices = await getCandles(symbol);
  const emaFast = calcEMA(prices, fastEMA).slice(-1)[0];
  const emaSlow = calcEMA(prices, slowEMA).slice(-1)[0];
  const rsi = calcRSI(prices).slice(-1)[0];
  const price = prices.slice(-1)[0];

  let position = positions[symbol] || { entry: 0, side: null, locked: 0 };
  let action = `${MODE}-WAIT`;
  let floating = 0;
  let pnlPercent = 0;

  if (position.side) {
    pnlPercent = position.side === "BUY"
      ? ((price - position.entry) / position.entry) * 100
      : ((position.entry - price) / position.entry) * 100;

    floating = (ALLOCATION * pnlPercent) / 100;

    if (floating >= lockUsd) {
      wallet += lockUsd;
      lockedProfit += lockUsd;
      position.locked += lockUsd;
      position.entry = price;
      action = `${modeEmoji} ${MODE}-TP ($${lockUsd.toFixed(2)} locked)`;
    }
  }

  // ENTRY / EXIT signals
  if (emaFast > emaSlow && rsi < rsiBuy) {
    action = `${modeEmoji} ${MODE}-BUY`;
    position = { entry: price, side: "BUY", locked: 0 };
  } else if (emaFast < emaSlow && rsi > rsiSell) {
    action = `${modeEmoji} ${MODE}-SELL`;
    position = { entry: price, side: "SELL", locked: 0 };
  }

  positions[symbol] = position;

  return { symbol, price, rsi, emaFast, emaSlow, action, pnlPercent, floating, locked: position.locked };
}

// === DISPLAY ===
async function mainLoop() {
  const results = await Promise.all(PAIRS.map(analyzePair));

  const table = new Table({
    head: ["Symbol", "Price", "RSI", "EMA-Fast", "EMA-Slow", "Action", "PnL%", "Float", "Locked", "Alloc"],
  });

  let totalFloating = 0;
  results.forEach((r) => {
    totalFloating += r.floating;
    table.push([
      r.symbol,
      r.price.toFixed(2),
      r.rsi.toFixed(2),
      r.emaFast.toFixed(2),
      r.emaSlow.toFixed(2),
      r.action,
      `${r.pnlPercent.toFixed(2)}%`,
      r.floating.toFixed(2),
      r.locked.toFixed(2),
      ALLOCATION.toFixed(2),
    ]);
  });

  console.clear();
  console.log(`🤖 DigiBot (LIVE MODE) - ${MODE} ${modeEmoji}\n`);
  console.log(table.toString());
  console.log(`
💰 Wallet (free): ${wallet.toFixed(2)} USDT
🔒 Total Locked: ${lockedProfit.toFixed(2)} USDT
📈 Floating (sum): ${totalFloating.toFixed(2)} USDT
📊 Equity: ${(wallet + totalFloating).toFixed(2)} USDT
⚙️ Mode: ${MODE} | EMA(${fastEMA}/${slowEMA}) | RSI(${rsiBuy}/${rsiSell}) | Lock: $${lockUsd}
⏳ Next cycle in 1 minute…
  `);
}

// === RUN LOOP ===
setInterval(mainLoop, 60 * 1000);
mainLoop();
