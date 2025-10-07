// DigiBot - EMA + RSI Hybrid with 1 USDT profit harvesting
// TESTNET Version (multi-pair independent tracking)

import axios from "axios";
import chalk from "chalk";
import Table from "cli-table3";

// === CONFIG ===
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const INTERVAL = 1; // minutes
const CAPITAL = 1000; // total paper balance
const ALLOCATION = CAPITAL / SYMBOLS.length; // per pair allocation
const LOCK_THRESHOLD_USD = 1.0; // lock every 1 USDT profit

// === STATE ===
let wallet = CAPITAL;
let positions = {};
let priceMemory = {}; // rolling memory per pair

// === Fetch last candles ===
async function fetchKlines(symbol) {
  try {
    const url = `https://api-testnet.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=1&limit=50`;
    const { data } = await axios.get(url);
    if (!data.result?.list) return [];
    return data.result.list.map(c => parseFloat(c[4])).reverse();
  } catch (err) {
    console.error(`API error for ${symbol}: ${err.message}`);
    return [];
  }
}

// === EMA ===
function calcEMA(values, period) {
  if (values.length < period) return values.at(-1);
  const k = 2 / (period + 1);
  return values.reduce(
    (acc, price, i) => (i === 0 ? price : price * k + acc * (1 - k)),
    values[0]
  );
}

// === RSI ===
function calcRSI(values, period = 14) {
  if (values.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff;
    else if (diff < 0) losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 0.0001;
  const rs = avgGain / avgLoss;
  let rsi = 100 - 100 / (1 + rs);
  if (rsi < 10) rsi = Math.random() * 10 + 10;
  if (rsi > 90) rsi = 90 - Math.random() * 10;
  return rsi;
}

// === Formatter ===
function formatPnL(pnl) {
  if (pnl > 0) return chalk.green(`${pnl.toFixed(2)}%`);
  if (pnl < 0) return chalk.red(`${pnl.toFixed(2)}%`);
  return chalk.yellow("0.00%");
}

// === Harvest function (USD-based) ===
function harvestProfit(symbol, price, pos) {
  const pnlUsd =
    pos.side === "BUY"
      ? (price - pos.entry) * (pos.alloc / pos.entry)
      : (pos.entry - price) * (pos.alloc / pos.entry);

  if (pnlUsd >= LOCK_THRESHOLD_USD) {
    const harvestUsd = Math.floor(pnlUsd);
    wallet += harvestUsd;
    pos.locked += harvestUsd;
    pos.entry = price; // reset entry
    console.log(
      chalk.cyan(
        `💎 ${symbol}: Locked ${harvestUsd.toFixed(
          2
        )} USDT profit at price ${price.toFixed(2)}`
      )
    );
  }
}

// === Bot Core ===
async function runBot() {
  const table = new Table({
    head: ["Symbol", "Price", "RSI", "EMA9", "EMA21", "Action", "PnL%", "Floating", "Locked", "Alloc"],
  });

  let totalLocked = 0;
  let totalFloating = 0;

  for (const symbol of SYMBOLS) {
    const closes = await fetchKlines(symbol);
    if (closes.length === 0) {
      table.push([symbol, "-", "-", "-", "-", "WAIT", "-", "-", "-", ALLOCATION.toFixed(2)]);
      continue;
    }

    // maintain rolling memory
    if (!priceMemory[symbol]) priceMemory[symbol] = [];
    priceMemory[symbol].push(...closes.slice(-5));
    priceMemory[symbol] = priceMemory[symbol].slice(-120);

    const series = priceMemory[symbol];
    const price = series.at(-1);
    const rsi = calcRSI(series.slice(-15));
    const ema9 = calcEMA(series.slice(-9), 9);
    const ema21 = calcEMA(series.slice(-21), 21);

    if (!positions[symbol])
      positions[symbol] = {
        entry: price,
        side: "BUY",
        alloc: ALLOCATION,
        locked: 0,
      };

    const pos = positions[symbol];
    let action = "WAIT";

    if (ema9 > ema21 && rsi < 70) pos.side = "BUY", action = "BUY";
    else if (ema9 < ema21 && rsi > 30) pos.side = "SELL", action = "SELL";

    // --- Floating PnL ---
    const pnlPct =
      pos.side === "BUY"
        ? ((price - pos.entry) / pos.entry) * 100
        : ((pos.entry - price) / pos.entry) * 100;
    const floatingUsd = (pos.alloc * pnlPct) / 100;

    // --- Harvest when ≥ 1 USDT ---
    harvestProfit(symbol, price, pos);

    totalLocked += pos.locked;
    totalFloating += floatingUsd;

    table.push([
      symbol,
      price.toFixed(2),
      rsi.toFixed(2),
      ema9.toFixed(2),
      ema21.toFixed(2),
      action,
      formatPnL(pnlPct),
      floatingUsd.toFixed(2),
      pos.locked.toFixed(2),
      pos.alloc.toFixed(2),
    ]);
  }

  console.clear();
  console.log("🤖 DigiBot (TESTNET) - EMA + RSI with USD-based trailing profit lock\n");
  console.log(table.toString());
  console.log(`\n💰 Wallet (free): ${wallet.toFixed(2)} USDT`);
  console.log(`🔒 Total Locked (sum of per-pair locked): ${totalLocked.toFixed(2)} USDT`);
  console.log(`📈 Floating (sum): ${totalFloating.toFixed(2)} USDT`);
  console.log(`📊 Equity: ${(wallet + totalLocked + totalFloating).toFixed(2)} USDT`);
  console.log(`⏳ Next cycle in ${INTERVAL} minute(s)…\n`);
}

// === Interval Loop ===
setInterval(runBot, INTERVAL * 60 * 1000);
runBot();
