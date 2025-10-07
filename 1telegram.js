require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { WebsocketClient, RestClientV5 } = require("bybit-api");

// -----------------------
// Telegram Setup
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const chatId = process.env.TELEGRAM_CHAT_ID;

// -----------------------
// Bybit Setup
const client = new RestClientV5({
  key: process.env.BYBIT_API_KEY,
  secret: process.env.BYBIT_API_SECRET,
  testnet: process.env.BYBIT_MODE === "TESTNET",
});

// -----------------------
// WebSocket Setup
const ws = new WebsocketClient(
  {
    key: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    testnet: process.env.BYBIT_MODE === "TESTNET",
  },
  ["trade"]
);

ws.on("open", () => {
  console.log("✅ Connected to Bybit WebSocket");
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err);
});

// -----------------------
// Signals State
let lastHour = -1;
let sentSignals = [];

// -----------------------
// Dummy Signal Generator
function generateSignals() {
  return {
    BTCUSDT: {
      action: Math.random() > 0.5 ? "BUY" : "SELL",
      entry: 27000 + Math.random() * 500,
      sl: 26500 + Math.random() * 100,
      tp: 27500 + Math.random() * 100,
    },
    ETHUSDT: {
      action: Math.random() > 0.5 ? "BUY" : "SELL",
      entry: 1600 + Math.random() * 50,
      sl: 1550 + Math.random() * 20,
      tp: 1650 + Math.random() * 20,
    },
  };
}

// -----------------------
// Process & Broadcast Signals
async function processSignals() {
  const now = new Date();
  const currentHour = now.getHours();

  // Reset signals per hour
  if (currentHour !== lastHour) {
    sentSignals = [];
    lastHour = currentHour;
  }

  const botSignals = generateSignals();

  for (const [pair, data] of Object.entries(botSignals)) {
    if (!sentSignals.includes(pair)) {
      try {
        // ✅ Fetch balance before trade
        const balanceResBefore = await client.getWalletBalance({
          accountType: "UNIFIED",
        });
        const usdtBefore = parseFloat(
          balanceResBefore.result.list[0].coin.find((c) => c.coin === "USDT")
            .walletBalance
        );

        const alloc = usdtBefore * 0.1;
        const qty = (alloc / data.entry).toFixed(3);

        // Log before-trade balance
        console.log(`\n💰 Balance BEFORE trade: ${usdtBefore.toFixed(2)} USDT`);

        // ⚡️ Pseudo trade execution (simulation only)
        let pnl = 0;
        const mockExit = data.action === "BUY" ? data.tp : data.sl;
        if (mockExit) {
          pnl =
            (mockExit - data.entry) *
            qty *
            (data.action === "BUY" ? 1 : -1);
        }

        // Fetch balance after (simulate by adding pnl)
        const usdtAfter = usdtBefore + pnl;

        // Log trade details
        console.log(`🚀 Simulated ${data.action} ${pair}`);
        console.log(
          `   Entry: ${data.entry.toFixed(2)} | SL: ${
            data.sl?.toFixed(2) || "N/A"
          } | TP: ${data.tp?.toFixed(2) || "N/A"}`
        );
        console.log(
          `   Qty: ${qty} | PnL: ${pnl.toFixed(2)} USDT`
        );
        console.log(
          `💰 Balance AFTER trade: ${usdtAfter.toFixed(2)} USDT\n`
        );
      } catch (err) {
        console.error("❌ Wallet fetch error:", err.message);
      }

      // 📢 Telegram broadcast (5 signals/hour)
      let actionLabel = "";
      if (data.action === "BUY") actionLabel = "🟢 LONG";
      else if (data.action === "SELL") actionLabel = "🔴 SHORT";
      else actionLabel = "🟡 HOLD";

      const message = `${actionLabel} Signal
Pair: ${pair}
Entry: ${data.entry.toFixed(2)}
SL: ${data.sl?.toFixed(2) || "N/A"}
TP: ${data.tp?.toFixed(2) || "N/A"}`;

      bot.sendMessage(chatId, `📢 DigiBot Signal:\n\n${message}`);
      sentSignals.push(pair);
    }
  }
}

// -----------------------
// Main Loop
setInterval(processSignals, 60 * 1000); // every 1 min
console.log(
  `🔒 Bybit mode: ${process.env.BYBIT_MODE} (Safe)\n🚀 DigiBot running...`
);
