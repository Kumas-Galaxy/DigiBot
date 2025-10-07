// telegram.js
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { RestClientV5 } from "bybit-api";

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const client = new RestClientV5({
  key: process.env.BYBIT_API_KEY,
  secret: process.env.BYBIT_API_SECRET,
  testnet: process.env.BYBIT_TESTNET === "true", // ✅ reads from .env
});

// --- Wallet Balance ---
async function getBalance() {
  try {
    const res = await client.getWalletBalance({ accountType: "UNIFIED" });
    const balance = res.result.list[0].totalEquity;
    return balance;
  } catch (err) {
    console.error("Balance fetch error:", err.message);
    return 0;
  }
}

// --- Place Trade ---
async function placeTrade(symbol, side, qty, sl, tp) {
  try {
    const order = await client.submitOrder({
      category: "linear",
      symbol,
      side,
      orderType: "Market",
      qty,
      timeInForce: "GTC",
      stopLoss: sl ? sl.toString() : undefined, // ✅ optional SL
      takeProfit: tp ? tp.toString() : undefined, // ✅ optional TP
    });

    console.log("✅ Order Placed:", order);
    return order;
  } catch (err) {
    console.error("Order placement failed:", err.message);
    throw err;
  }
}

// --- Telegram Commands ---
bot.onText(/\/start/, async (msg) => {
  bot.sendMessage(msg.chat.id, "🤖 DigiBot ready! Use /balance or /trade");
});

bot.onText(/\/balance/, async (msg) => {
  const bal = await getBalance();
  bot.sendMessage(msg.chat.id, `💰 Wallet Balance: ${bal} USDT`);
});

bot.onText(
  /\/trade (.+) (BUY|SELL) (.+) (.+) (.+)/,
  async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1];
    const side = match[2];
    const qty = parseFloat(match[3]);
    const sl = parseFloat(match[4]);
    const tp = parseFloat(match[5]);

    try {
      const res = await placeTrade(symbol, side, qty, sl, tp);
      bot.sendMessage(
        chatId,
        `✅ Order Confirmed\n\nSymbol: ${symbol}\nSide: ${side}\nQty: ${qty}\nSL: ${sl}\nTP: ${tp}\n\nOrderId: ${res.result.orderId}`
      );
    } catch {
      bot.sendMessage(chatId, "❌ Trade failed. Check console.");
    }
  }
);

bot.on("polling_error", (err) => console.error("Telegram error:", err.message));
