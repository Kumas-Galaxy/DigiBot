import express from "express";
import bodyParser from "body-parser";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import WebSocket from "ws";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(bodyParser.json());

// /start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Welcome to Kumas DigiBot! Live MA signals incoming 📈");
});

// -----------------------
// LIVE SIGNALS
let sentSignals = [];
let lastHour = new Date().getHours();
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const livePrices = {};
const priceHistory = {};
symbols.forEach(sym => { priceHistory[sym] = []; });

// -----------------------
// Connect to Bybit V5 Linear Public WebSocket
let ws;

function connectWebSocket() {
  ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");

  ws.on("open", () => {
    console.log("✅ Connected to Bybit Linear Perpetual WebSocket");
    // Subscribe to trades for all pairs
    const args = symbols.map(sym => `publicTrade.${sym}`);
    ws.send(JSON.stringify({ op: "subscribe", args }));
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.topic && msg.topic.startsWith("publicTrade.")) {
        const sym = msg.topic.split(".")[1];
        const price = parseFloat(msg.data[0].p); // 'p' is the price field in v5
        livePrices[sym] = price;
      }
    } catch (err) {
      console.error("❌ WebSocket parse error:", err.message);
    }
  });

  ws.on("error", (err) => console.error("❌ WebSocket error:", err.message));
  ws.on("close", () => {
    console.warn("⚠️ WebSocket closed. Reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });
}

connectWebSocket();

// -----------------------
// Moving Average Calculation
function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((acc, val) => acc + val, 0) / slice.length;
}

// -----------------------
// Generate signals
function generateSignals() {
  const signals = {};

  symbols.forEach(sym => {
    const price = livePrices[sym];
    if (!price) return;

    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 50) priceHistory[sym].shift();

    const shortMA = calculateMA(priceHistory[sym], 5);
    const longMA = calculateMA(priceHistory[sym], 20);

    if (!shortMA || !longMA) return;

    let action = null;
    if (shortMA > longMA) action = "BUY";
    else if (shortMA < longMA) action = "SELL";
    else action = "HOLD"; // Shuttle / Neutral

    if (action) {
      const entry = price;
      const sl = action === "BUY" ? price * 0.995 :
                 action === "SELL" ? price * 1.005 : null;
      const tp = action === "BUY" ? price * 1.01 :
                 action === "SELL" ? price * 0.99 : null;

      signals[sym] = { action, entry, sl, tp };
    }
  });

  return signals;
}

// -----------------------
// Get current signals (once per hour per pair)
function getCurrentSignals() {
  const signals = [];
  const now = new Date();
  const currentHour = now.getHours();

  if (currentHour !== lastHour) {
    sentSignals = [];
    lastHour = currentHour;
  }

  const botSignals = generateSignals();

  for (const [pair, data] of Object.entries(botSignals)) {
    if (!sentSignals.includes(pair)) {
      let actionLabel = "";
      if (data.action === "BUY") actionLabel = "🟢 LONG";
      else if (data.action === "SELL") actionLabel = "🔴 SHORT";
      else actionLabel = "🟡 HOLD";

      const message = `${actionLabel} Signal
Pair: ${pair}
Entry: ${data.entry.toFixed(2)}
${data.sl ? `SL: ${data.sl.toFixed(2)}` : "SL: N/A"}
${data.tp ? `TP: ${data.tp.toFixed(2)}` : "TP: N/A"}`;

      signals.push({ id: pair, message });
      sentSignals.push(pair);
    }
  }

  return signals;
}

// -----------------------
// Auto-send signals every 5 seconds
setInterval(() => {
  const signals = getCurrentSignals();
  signals.forEach(sig => {
    bot.sendMessage(chatId, `📢 DigiBot Signal:\n\n${sig.message}`);
    console.log("✅ Live Signal sent:", sig.message);
  });
}, 5000);

// -----------------------
// Express server (optional)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Telegram signal server running on port ${PORT}`);
});
