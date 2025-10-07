// =========================================
// 🤖 DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid
// =========================================
import axios from "axios";
import dotenv from "dotenv";
import chalk from "chalk";
import Table from "cli-table3";

dotenv.config();

// Bybit REST & keys
const BYBIT_TESTNET = process.env.BYBIT_TESTNET === "true";
const API_URL = BYBIT_TESTNET
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";
const API_KEY = BYBIT_TESTNET
  ? process.env.BYBIT_TESTNET_KEY
  : process.env.BYBIT_API_KEY;
const API_SECRET = BYBIT_TESTNET
  ? process.env.BYBIT_TESTNET_SECRET
  : process.env.BYBIT_API_SECRET;

// Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Trading pairs and parameters
const PAIRS = ["BTC/USDT", "ETH/USDT", "BNB/USDT", "LTC/USDT", "XRP/USDT"];
const MODES = ["SCALP", "SWING", "HEDGE"];
let vault = 0;
let signalsSent = false;

// ==============================
// 📡 Telegram Broadcast System
// ==============================
async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });
    console.log(chalk.cyan("📩 Telegram broadcast sent!"));
  } catch (err) {
    console.log("Telegram Error:", err.response?.statusText || err.message);
  }
}

async function broadcastSignals(signals) {
  const header = `🤖 *DigiBot (TESTNET)* - EMA+RSI Dynamic Hybrid\n================================================\n\n📡 *5 Fresh Market Signals (Hourly)*\n`;

  const formattedSignals = signals
    .slice(0, 5)
    .map((sig) => {
      const emoji =
        sig.signal === "BUY"
          ? "🚀 LONG"
          : sig.signal === "SELL"
          ? "⚡ SHORT"
          : "⏸ WAIT";
      const trend =
        sig.signal === "BUY"
          ? "📈 Trend: UP"
          : sig.signal === "SELL"
          ? "📉 Trend: DOWN"
          : "➖ Trend: Neutral";
      return `${emoji} *${sig.symbol}*\n💲 Entry: ${sig.price}\n🎯 TP: ${sig.tp}\n🛑 SL: ${sig.sl}\n${trend}\n`;
    })
    .join("\n");

  const footer = `\n💡 *Signals generated using EMA+RSI Dynamic Hybrid engine.*`;
  await sendTelegramMessage(header + formattedSignals + footer);
}

async function broadcastLockedProfit(pair, profit, mode, ema9, ema21, rsi) {
  const trend =
    ema9 > ema21
      ? "📈 UP (Bullish continuation expected)"
      : "📉 DOWN (Bearish continuation likely)";
  const analysis =
    ema9 > ema21
      ? "- EMA9 crossed above EMA21 → *Bullish short-term trend forming.*"
      : "- EMA9 crossed below EMA21 → *Bearish pressure detected.*";

  const message = `🤖 *DigiBot (TESTNET)* - EMA+RSI Dynamic Hybrid\n================================================\n\n✅ *${pair}* locked *+$${profit.toFixed(
    2
  )}* profit!\n\n📊 *Technical Analysis:*\n- Mode: ${mode}\n${analysis}\n- RSI: ${rsi.toFixed(
    2
  )} → ${
    rsi > 70 ? "Overbought zone" : rsi < 30 ? "Oversold zone" : "Neutral momentum"
  }\n- Profit auto-locked to secure gains.\n\n${trend}`;
  await sendTelegramMessage(message);
}

// ===============================
// 📈 Simulated Market Fetch
// ===============================
async function fetchRSIandEMA(symbol) {
  // mock data generator (simulate API fetch)
  return {
    rsi: Math.random() * 100,
    ema9: Math.random() * 1000 + 100,
    ema21: Math.random() * 1000 + 100,
    price: Math.random() * 1000 + 100,
  };
}

// ===============================
// ⚙️ Core DigiBot Logic
// ===============================
async function runCycle() {
  console.clear();
  console.log(chalk.yellow.bold(`\n🤖 DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid\n`));

  const table = new Table({
    head: [
      "Symbol",
      "Mode",
      "Price",
      "RSI",
      "EMA9",
      "EMA21",
      "Signal",
      "PnL",
      "Vault",
    ],
    style: { head: ["cyan"], border: ["grey"] },
  });

  const signals = [];

  for (let i = 0; i < PAIRS.length; i++) {
    const symbol = PAIRS[i];
    const mode = MODES[i % MODES.length];
    try {
      const { price, rsi, ema9, ema21 } = await fetchRSIandEMA(symbol);
      let signal = "WAIT";
      if (ema9 > ema21 && rsi < 70) signal = "BUY";
      else if (ema9 < ema21 && rsi > 30) signal = "SELL";

      const pnl = (Math.random() * 4 - 2).toFixed(2); // -2% to +2%
      const pnlColor = pnl >= 0 ? chalk.green(`${pnl}%`) : chalk.red(`${pnl}%`);
      const lockedProfit = pnl > 1 ? (pnl * 0.02).toFixed(2) : 0;

      if (lockedProfit > 0) {
        vault += parseFloat(lockedProfit);
        console.log(chalk.green(`💰 ${symbol} locked $${lockedProfit} profit to vault!`));
        await broadcastLockedProfit(symbol, parseFloat(lockedProfit), mode, ema9, ema21, rsi);
      }

      signals.push({
        symbol,
        price: price.toFixed(2),
        signal,
        tp: (price * 1.01).toFixed(2),
        sl: (price * 0.99).toFixed(2),
      });

      table.push([
        symbol,
        mode,
        price.toFixed(2),
        rsi.toFixed(2),
        ema9.toFixed(2),
        ema21.toFixed(2),
        signal,
        pnlColor,
        `$${vault.toFixed(2)}`,
      ]);
    } catch (e) {
      console.log(chalk.red(`Error fetching ${symbol}: ${e.message}`));
    }
  }

  console.log(table.toString());
  console.log(chalk.cyan(`💰 Vault: ${vault.toFixed(2)}\n`));

  // Broadcast signals every hour (first cycle only)
  if (!signalsSent) {
    await broadcastSignals(signals);
    signalsSent = true;
    setTimeout(() => (signalsSent = false), 60 * 60 * 1000);
  }
}

// Run continuously
setInterval(runCycle, 30000); // every 30 seconds
runCycle();
