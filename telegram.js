// telegram.js
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import WebSocket from "ws";
import { RestClientV5 } from "bybit-api";

dotenv.config();

// -----------------------
// Config / Bybit client selection
const isTestnet = process.env.BYBIT_TESTNET === "true";
const BYBIT_API_KEY = isTestnet ? process.env.BYBIT_TESTNET_KEY : process.env.BYBIT_API_KEY;
const BYBIT_API_SECRET = isTestnet ? process.env.BYBIT_TESTNET_SECRET : process.env.BYBIT_API_SECRET;

const client = new RestClientV5({
  key: BYBIT_API_KEY,
  secret: BYBIT_API_SECRET,
  testnet: isTestnet,
});

console.log(`🔒 Bybit mode: ${isTestnet ? "TESTNET (Safe)" : "LIVE (Real Money)"}`);

// -----------------------
// Telegram
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
if (!token || !chatId) console.warn("⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing in .env");

const bot = new TelegramBot(token, { polling: true });
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Welcome to Kumas DigiBot! Shuttle signals active 🚀");
});

// -----------------------
// Settings
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const MIN_ALLOC = 5; // minimum USDT allocation to attempt a trade
let lastHour = new Date().getHours();
const livePrices = {};
const priceHistory = {};
SYMBOLS.forEach((s) => (priceHistory[s] = []));

// -----------------------
// Bybit public WebSocket (v5 public linear)
let ws;
function connectWebSocket() {
  ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");

  ws.on("open", () => {
    console.log("✅ Connected to Bybit WebSocket");
    const args = SYMBOLS.map((s) => `publicTrade.${s}`);
    ws.send(JSON.stringify({ op: "subscribe", args }));
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.topic && msg.topic.startsWith("publicTrade.")) {
        const sym = msg.topic.split(".")[1];
        const price = parseFloat(msg.data[0].p);
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
// Helper functions
function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const s = prices.slice(-period);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

function generateSignals() {
  const out = {};
  SYMBOLS.forEach((sym) => {
    const price = livePrices[sym];
    if (!price) return;

    priceHistory[sym].push(price);
    if (priceHistory[sym].length > 50) priceHistory[sym].shift();

    const shortMA = calculateMA(priceHistory[sym], 5);
    const longMA = calculateMA(priceHistory[sym], 20);
    if (!shortMA || !longMA) {
      out[sym] = { action: "HOLD", entry: price, sl: null, tp: null };
      return;
    }

    let action = "HOLD";
    if (shortMA > longMA) action = "BUY";
    else if (shortMA < longMA) action = "SELL";

    const entry = price;
    const sl = action === "BUY" ? price * 0.995 : action === "SELL" ? price * 1.005 : null;
    const tp = action === "BUY" ? price * 1.01 : action === "SELL" ? price * 0.99 : null;

    out[sym] = { action, entry, sl, tp };
  });
  return out;
}

// -----------------------
// Trade execution helper (Testnet or live based on isTestnet)
// NOTE: This places MARKET orders with TP/SL using submitOrder fields.
// Uses 10% allocation; respects MIN_ALLOC.
async function executeTrade(pair, sig) {
  try {
    // read wallet
    const balanceRes = await client.getWalletBalance({ accountType: "UNIFIED" });
    const usdtObj = balanceRes?.result?.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const usdtBefore = usdtObj ? parseFloat(usdtObj.walletBalance) : null;

    if (usdtBefore === null) {
      console.error(`❌ Could not read USDT wallet for ${pair}`);
      return null;
    }

    const alloc = usdtBefore * 0.1;
    if (alloc < MIN_ALLOC) {
      console.log(`⚠️ Skipping order for ${pair}: alloc ${alloc.toFixed(4)} USDT < MIN_ALLOC ${MIN_ALLOC}`);
      return { skipped: true, reason: "insufficient_alloc", usdtBefore };
    }

    // qty calculation (simple): amount / entry
    const rawQty = alloc / sig.entry;
    // For readability, round to 6 decimals (adjust per symbol if you want)
    const qty = Number(rawQty.toFixed(6));

    const side = sig.action === "BUY" ? "Buy" : "Sell";
    const shuttleLabel = sig.action === "BUY" ? "🚀 Up Shuttle" : "⛏️ Down Shuttle";

    console.log(`\n${shuttleLabel} — PLACING ORDER: ${pair} ${sig.action}`);
    console.log(`   Entry: ${sig.entry.toFixed(6)}, Qty: ${qty}, SL: ${sig.sl?.toFixed(6)}, TP: ${sig.tp?.toFixed(6)}`);
    console.log(`   Wallet before: ${usdtBefore.toFixed(6)} USDT (alloc ${alloc.toFixed(6)} USDT)\n`);

    // Place market order with TP/SL
    const order = await client.submitOrder({
      category: "linear",
      symbol: pair,
      side: sig.action === "BUY" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(qty),
      timeInForce: "GoodTillCancel",
      takeProfit: sig.tp ? sig.tp.toFixed(6) : undefined,
      stopLoss: sig.sl ? sig.sl.toFixed(6) : undefined,
    });

    console.log(`✅ Order response for ${pair}:`, order?.retMsg || order);

    // Small pause to allow balances to update on testnet
    await new Promise((r) => setTimeout(r, 1200));

    // read wallet after
    const balanceResAfter = await client.getWalletBalance({ accountType: "UNIFIED" });
    const usdtObjAfter = balanceResAfter?.result?.list?.[0]?.coin?.find((c) => c.coin === "USDT");
    const usdtAfter = usdtObjAfter ? parseFloat(usdtObjAfter.walletBalance) : null;

    if (usdtAfter !== null && usdtBefore !== null) {
      const pnl = usdtAfter - usdtBefore;
      console.log(`💰 Wallet AFTER ${pair}: ${usdtAfter.toFixed(6)} USDT (PnL ${pnl.toFixed(6)} USDT)\n`);
      return { order, usdtBefore, usdtAfter, pnl };
    } else {
      console.log(`⚠️ Could not read balance AFTER order for ${pair}`);
      return { order, usdtBefore };
    }
  } catch (err) {
    console.error(`❌ Order error for ${pair}:`, err?.message || err);
    return { error: err };
  }
}

// -----------------------
// Hourly batch: broadcast 5 signals and execute trades (testnet if configured)
let lastBroadcastHour = new Date().getHours() - 1; // force immediate first-run when conditions met

async function hourlyJob() {
  const now = new Date();
  const hour = now.getHours();

  if (hour === lastBroadcastHour) return; // already ran this hour
  lastBroadcastHour = hour;

  const signals = generateSignals();

  // Build broadcast message (channel only)
  let broadcast = `📡 Kumas DigiBot – Hourly Signals (${now.toUTCString()})\n\n`;

  // We'll collect execution results for console only
  const execResults = [];

  // Loop through fixed list to ensure exactly 5 signals
  for (const sym of SYMBOLS) {
    const s = signals[sym] || { action: "HOLD", entry: livePrices[sym] || 0, sl: null, tp: null };
    const shuttle = s.action === "BUY" ? "🚀 Up Shuttle (LONG)" : s.action === "SELL" ? "⛏️ Down Shuttle (SHORT)" : "🟡 Neutral (HOLD)";

    // Append to broadcast message (no balances)
    broadcast += `${shuttle} — ${sym}\n`;
    broadcast += `   🎯 Entry: ${s.entry ? s.entry.toFixed(6) : "N/A"}\n`;
    broadcast += `   ⛔ SL: ${s.sl ? s.sl.toFixed(6) : "N/A"}\n`;
    broadcast += `   🎯 TP: ${s.tp ? s.tp.toFixed(6) : "N/A"}\n\n`;

    // Execute trade only for BUY/SELL; execution results kept private (console)
    if (s.action === "BUY" || s.action === "SELL") {
      // wait sequentially for each trade to avoid bursts
      /* eslint-disable no-await-in-loop */
      const res = await executeTrade(sym, s);
      execResults.push({ sym, sig: s, res });
      await new Promise((r) => setTimeout(r, 500)); // small gap between orders
      /* eslint-enable no-await-in-loop */
    } else {
      // No action — just note in console
      console.log(`ℹ️ ${sym} is HOLD (no trade). Entry: ${s.entry}`);
    }
  }

  broadcast += "⌛ Next batch in 1 hour…";

  // Send broadcast to channel (new message each hour)
  try {
    await bot.sendMessage(chatId, broadcast);
    console.log("📢 Broadcast sent to channel (5 signals).");
  } catch (err) {
    console.error("❌ Failed to send broadcast:", err?.message || err);
  }

  // Console-only detailed logs of executions (no channel broadcast)
  console.log("===== EXECUTION SUMMARY (private) =====");
  execResults.forEach((r) => {
    if (r.res && r.res.error) {
      console.log(`${r.sym} -> ERROR:`, r.res.error.message || r.res.error);
    } else if (r.res && r.res.skipped) {
      console.log(`${r.sym} -> SKIPPED: ${r.res.reason} | Wallet before: ${r.res.usdtBefore}`);
    } else if (r.res) {
      console.log(`${r.sym} -> Order placed. PnL: ${typeof r.res.pnl !== "undefined" ? r.res.pnl.toFixed(6) : "N/A"} USDT`);
    } else {
      console.log(`${r.sym} -> No execution result.`);
    }
  });
  console.log("=======================================");
}

// -----------------------
// Start the hourly scheduler (checks every 10s)
setInterval(hourlyJob, 10 * 1000);

// Run immediate check on start (only if the hour changed relative to lastBroadcastHour)
hourlyJob().catch((e) => console.error("Initial hourlyJob error:", e));
