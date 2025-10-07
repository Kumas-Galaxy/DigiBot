// -----------------------
// Imports
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import WebSocket from "ws";
import { RestClientV5 } from "bybit-api";

dotenv.config();

// -----------------------
// Bybit Client
const client = new RestClientV5({
  key: process.env.BYBIT_TESTNET === "true" ? process.env.BYBIT_TESTNET_KEY : process.env.BYBIT_API_KEY,
  secret: process.env.BYBIT_TESTNET === "true" ? process.env.BYBIT_TESTNET_SECRET : process.env.BYBIT_API_SECRET,
  testnet: process.env.BYBIT_TESTNET === "true"
});

// -----------------------
// Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Welcome to Kumas DigiBot! Live MA + RSI signals active 📈");
});

// -----------------------
// Symbols & tracking
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const priceHistory = {};
const livePrices = {};
symbols.forEach(sym => priceHistory[sym] = []);

let sentSignals = [];
let lastHour = new Date().getHours();

// -----------------------
// WebSocket connection
let ws;
function connectWebSocket() {
  ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
  ws.on("open", () => {
    console.log("✅ Connected to Bybit WebSocket");
    ws.send(JSON.stringify({ op: "subscribe", args: symbols.map(s => `publicTrade.${s}`) }));
  });

  ws.on("message", data => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.topic && msg.topic.startsWith("publicTrade.")) {
        const sym = msg.topic.split(".")[1];
        const price = parseFloat(msg.data[0].p);
        livePrices[sym] = price;
      }
    } catch (err) {
      console.error("❌ WebSocket parse error:", err.message);
    }
  });

  ws.on("close", () => {
    console.warn("⚠️ WebSocket closed. Reconnecting in 5s...");
    setTimeout(connectWebSocket, 5000);
  });

  ws.on("error", err => console.error("❌ WebSocket error:", err.message));
}
connectWebSocket();

// -----------------------
// MA calculation
function calculateMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a,b) => a+b, 0) / period;
}

// -----------------------
// RSI calculation
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff; // losses are positive
  }

  if (gains + losses === 0) return 50; // neutral

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// -----------------------
// Signal generation
function generateSignalsWithEngineLogic() {
  const signals = {};
  for (const sym of symbols) {
    const price = livePrices[sym];
    if (!price) continue;

    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 50) priceHistory[sym].shift();

    const shortMA = calculateMA(priceHistory[sym], 5);
    const longMA = calculateMA(priceHistory[sym], 20);
    const rsi = calculateRSI(priceHistory[sym], 14);

    let action = "HOLD";
    if (shortMA && longMA && rsi !== null) {
      if (shortMA > longMA && rsi < 60) action = "BUY";
      else if (shortMA < longMA && rsi > 40) action = "SELL";
    }

    const sl = action === "BUY" ? price * 0.995 : action === "SELL" ? price * 1.005 : null;
    const tp = action === "BUY" ? price * 1.01 : action === "SELL" ? price * 0.99 : null;

    signals[sym] = { action, entry: price, sl, tp, rsi };
  }
  return signals;
}

// -----------------------
// Fetch wallet & locked profit
async function fetchWalletAndPnL() {
  try {
    const walletRes = await client.getWalletBalance({ accountType: "UNIFIED" });
    const usdtWallet = walletRes.result.list[0].coin.find(c => c.coin === "USDT");
    const availableUSDT = parseFloat(usdtWallet?.availableBalance || 0);
    const totalUSDT = parseFloat(usdtWallet?.walletBalance || 0);

    let lockedProfit = 0;
    for (const sym of symbols) {
      try {
        const posRes = await client.getPositions({ category: "linear", symbol: sym });
        if (posRes.result && posRes.result.length) {
          lockedProfit += parseFloat(posRes.result[0].unrealisedPnl || 0);
        }
      } catch (err) {
        // silently continue if one symbol fails
      }
    }

    const equity = availableUSDT + lockedProfit;
    return { availableUSDT, totalUSDT, lockedProfit, equity };

  } catch (err) {
    console.error("❌ Wallet/Positions fetch error:", err.message);
    return { availableUSDT: 0, totalUSDT: 0, lockedProfit: 0, equity: 0 };
  }
}

// -----------------------
// Process signals & dashboard
async function processSignals() {
  const now = new Date();
  const currentHour = now.getHours();
  if (currentHour !== lastHour) {
    sentSignals = [];
    lastHour = currentHour;
  }

  const signals = generateSignalsWithEngineLogic();
  const { availableUSDT, totalUSDT, lockedProfit, equity } = await fetchWalletAndPnL();

  const dashboard = [];
  for (const [sym, data] of Object.entries(signals)) {
    const allocatedQty = data.entry ? (availableUSDT * 0.1 / data.entry).toFixed(3) : 0;

    dashboard.push({
      Symbol: sym,
      Action: data.action,
      Entry: data.entry?.toFixed(2) || "N/A",
      SL: data.sl?.toFixed(2) || "N/A",
      TP: data.tp?.toFixed(2) || "N/A",
      RSI: data.rsi?.toFixed(2) || "N/A",
      Allocated: allocatedQty,
      Available: availableUSDT.toFixed(2),
      Wallet: totalUSDT.toFixed(2),
      LockedProfit: lockedProfit.toFixed(2),
      Equity: equity.toFixed(2)
    });

    if ((data.action === "BUY" || data.action === "SELL") && allocatedQty > 0) {
      try {
        const side = data.action === "BUY" ? "Buy" : "Sell";
        await client.placeActiveOrder({
          category: "linear",
          symbol: sym,
          side,
          orderType: "Market",
          qty: allocatedQty.toString(),
          timeInForce: "GoodTillCancel"
        });
        console.log(`✅ Order placed: ${side} ${allocatedQty} ${sym}`);
      } catch (err) {
        console.error(`❌ Order failed for ${sym}:`, err.message);
      }
    }
  }

  console.table(dashboard);

  let broadcastCount = 0;
  for (const [sym, data] of Object.entries(signals)) {
    if (!sentSignals.includes(sym) && broadcastCount < 5) {
      const actionLabel = data.action === "BUY" ? "🟢 LONG" : data.action === "SELL" ? "🔴 SHORT" : "🟡 HOLD";
      const message = `${actionLabel} Signal\nPair: ${sym}\nEntry: ${data.entry?.toFixed(2)}\nSL: ${data.sl?.toFixed(2) || "N/A"}\nTP: ${data.tp?.toFixed(2) || "N/A"}`;
      bot.sendMessage(chatId, `📢 DigiBot Signal:\n\n${message}`);
      sentSignals.push(sym);
      broadcastCount++;
    }
  }
}

// -----------------------
// Auto-run every minute
setInterval(processSignals, 60_000);

// Initial run
processSignals();
