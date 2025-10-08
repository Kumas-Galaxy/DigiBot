/**
 * 🤖 Kumas DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid (Scalp / Swing / Hedge)
 * Auto-switches between local proxy and Render proxy.
 */

import fetch from "node-fetch";
import chalk from "chalk";
import Table from "cli-table3";
import dotenv from "dotenv";
dotenv.config();

// === SETTINGS ===
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const INTERVAL = "1"; // 1m candles
const CATEGORY = "spot";
const PROXY_LOCAL = "http://localhost:3001/klines";
const PROXY_RENDER = "https://kumas-digibot.onrender.com/klines";

let ACTIVE_PROXY = PROXY_RENDER; // default to Render

// === TRY LOCAL FIRST ===
const checkProxy = async () => {
  try {
    const res = await fetch(`${PROXY_LOCAL}?symbol=BTCUSDT&interval=1&category=spot`);
    if (res.ok) {
      ACTIVE_PROXY = PROXY_LOCAL;
      console.log(chalk.green(`✅ Local proxy detected: ${PROXY_LOCAL}`));
    } else {
      console.log(chalk.yellow(`⚠️ Using Render proxy: ${PROXY_RENDER}`));
    }
  } catch {
    console.log(chalk.yellow(`⚠️ Local proxy not reachable — using Render proxy`));
  }
};

// === HELPER: RSI CALC ===
const calculateRSI = (closes, period = 14) => {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const RS = gains / losses;
  return 100 - 100 / (1 + RS);
};

// === HELPER: EMA CALC ===
const calculateEMA = (data, period) => {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
};

// === FETCH KLINES ===
const fetchKlines = async (symbol) => {
  try {
    const res = await fetch(`${ACTIVE_PROXY}?symbol=${symbol}&interval=${INTERVAL}&category=${CATEGORY}`);
    const json = await res.json();

    if (!json.result?.list) throw new Error(`No data for ${symbol}`);

    const closes = json.result.list.map(k => parseFloat(k[4])).reverse();
    const price = closes[closes.length - 1];
    const rsi = calculateRSI(closes);
    const ema9 = calculateEMA(closes.slice(-21), 9);
    const ema21 = calculateEMA(closes.slice(-21), 21);

    return { symbol, price, rsi, ema9, ema21 };
  } catch (err) {
    console.log(chalk.red(`❌ fetchKlines failed for ${symbol}: ${err.message}`));
    return null;
  }
};

// === SIGNAL GENERATOR ===
const getSignal = (ema9, ema21, rsi) => {
  if (rsi > 70 && ema9 < ema21) return "SELL";
  if (rsi < 30 && ema9 > ema21) return "BUY";
  return "WAIT";
};

// === MAIN LOOP ===
const runBot = async () => {
  console.clear();
  console.log(chalk.cyan.bold("\n🤖 Kumas DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid (Scalp / Swing / Hedge)\n"));

  const table = new Table({
    head: ["Pair", "Mode", "Price", "RSI", "EMA9", "EMA21", "Signal", "TP/SL", "PnL", "Vault"],
    style: { head: ["cyan"], border: ["grey"] }
  });

  const results = await Promise.all(SYMBOLS.map(fetchKlines));

  for (const data of results) {
    if (!data) continue;
    const { symbol, price, rsi, ema9, ema21 } = data;
    const mode = "HEDGE";
    const signal = getSignal(ema9, ema21, rsi);
    const pnl = (Math.random() * 0.2 - 0.1).toFixed(2); // demo PnL
    const vault = "$0.00";
    const tp_sl = "---";

    table.push([
      symbol,
      mode,
      price.toFixed(6),
      rsi.toFixed(2),
      ema9.toFixed(6),
      ema21.toFixed(6),
      signal,
      tp_sl,
      `${pnl}%`,
      vault
    ]);
  }

  console.log(table.toString());
  console.log(chalk.greenBright("\n✅ DigiBot updated successfully\n"));
};

// === BOOT ===
await checkProxy();
runBot();
setInterval(runBot, 60_000); // update every 60s
