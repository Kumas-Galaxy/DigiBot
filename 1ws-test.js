// ws-test.js
import WebSocket from "ws";
import axios from "axios";
import dotenv from "dotenv";
import { SMA, RSI } from "technicalindicators";

dotenv.config();

// Config
const pairs = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const shortPeriod = 9;
const longPeriod = 21;
const rsiPeriod = 14;
const lastSignals = {}; // track last time a signal was sent per pair

// Store candles (closing prices per pair)
const candles = {};
pairs.forEach(p => (candles[p] = []));

// Connect to Binance WebSocket
const streams = pairs.map(p => p.toLowerCase() + "@trade").join("/");
const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

ws.on("open", () => {
  console.log("✅ Connected to Binance WebSocket");
});

ws.on("message", msg => {
  const data = JSON.parse(msg);
  const trade = data.data;
  const pair = trade.s;
  const price = parseFloat(trade.p);

  // Add price to candle closes
  candles[pair].push(price);
  if (candles[pair].length > 500) candles[pair].shift(); // keep recent 500 closes

  // Check signals every update
  checkSignal(pair);
});

// --- Signal Logic ---
function checkSignal(pair) {
  const closes = candles[pair];
  if (closes.length < longPeriod + 2) return; // need enough data

  const shortMA = SMA.calculate({ period: shortPeriod, values: closes });
  const longMA = SMA.calculate({ period: longPeriod, values: closes });
  const rsi = RSI.calculate({ period: rsiPeriod, values: closes });

  if (shortMA.length < 2 || longMA.length < 2 || rsi.length < 1) return;

  const lastShort = shortMA[shortMA.length - 1];
  const prevShort = shortMA[shortMA.length - 2];
  const lastLong = longMA[longMA.length - 1];
  const prevLong = longMA[longMA.length - 2];
  const lastRSI = rsi[rsi.length - 1];
  const entry = closes[closes.length - 1];

  const now = Date.now();
  if (lastSignals[pair] && now - lastSignals[pair] < 3600 * 1000) return; // 1h cooldown

  // LONG signal
  if (prevShort < prevLong && lastShort > lastLong && lastRSI < 70) {
    sendSignal(pair, "LONG", entry, now);
  }

  // SHORT signal
  if (prevShort > prevLong && lastShort < lastLong && lastRSI > 30) {
    sendSignal(pair, "SHORT", entry, now);
  }
}

function sendSignal(pair, side, entry, now) {
  const sl = side === "LONG" ? entry * 0.99 : entry * 1.01;
  const tp = side === "LONG" ? entry * 1.02 : entry * 0.98;

  const text = `📊 ${pair} ${side}\nEntry: ${entry.toFixed(2)}\nSL: ${sl.toFixed(2)}\nTP: ${tp.toFixed(2)}\n🕒 ${new Date().toLocaleString()}`;
  console.log(text);

axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  chat_id: process.env.TELEGRAM_CHAT_ID,
  text
})
    .then(() => {
      lastSignals[pair] = now; // update only after success
    })
    .catch(err => {
      console.error("Telegram error:", err.response?.data || err.message);
    });
}
