import dotenv from "dotenv";
import { WebsocketClient, RestClientV5 } from "bybit-api";
import Table from "cli-table3";

dotenv.config();

const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;

const wsClient = new WebsocketClient({ key: API_KEY, secret: API_SECRET });
const restClient = new RestClientV5({ key: API_KEY, secret: API_SECRET });

let simulatedWallet = 10000;
let lockedVault = 0;
let livePrices = {};
let priceHistory = {};
let positions = {};

const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];

// === Indicators ===
function calculateMA(prices, length) {
  if (prices.length < length) return null;
  const slice = prices.slice(-length);
  return slice.reduce((a, b) => a + b, 0) / length;
}

function calculateRSI(prices, length = 14) {
  if (prices.length < length + 1) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - length; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// === Preload history ===
async function preloadHistory() {
  for (const sym of symbols) {
    const klines = await restClient.getKline({
      category: "spot",
      symbol: sym,
      interval: "1",
      limit: 100,
    });
    priceHistory[sym] = klines.result.list.map(k => ({
      close: parseFloat(k[4])
    })).reverse();
    console.log(`📊 History preloaded for ${sym}`);
  }
}

// === WebSocket live prices ===
wsClient.on("update", ({ topic, data }) => {
  const [sym] = topic.split(".");
  if (data && data.length > 0) {
    const lastPrice = parseFloat(data[0].p);
    livePrices[sym] = lastPrice;

    // push into history for RSI & MA
    if (!priceHistory[sym]) priceHistory[sym] = [];
    priceHistory[sym].push({ close: lastPrice });
    if (priceHistory[sym].length > 200) priceHistory[sym].shift();
  }
});

// === Strategy + Vault Simulation ===
function processSignals() {
  const table = new Table({
    head: [
      "Symbol", "Action", "Entry", "SL", "TP", "RSI",
      "Allocated", "Available", "Wallet", "LockedVault", "Equity"
    ]
  });

  for (const sym of symbols) {
    const prices = priceHistory[sym]?.map(p => p.close) || [];
    const price = livePrices[sym] || (prices.length ? prices[prices.length - 1] : 0);

    const shortMA = calculateMA(prices, 5);
    const longMA = calculateMA(prices, 20);
    const rsi = calculateRSI(prices, 14);

    let action = "HOLD";
    let entry = "N/A", sl = "N/A", tp = "N/A";
    let allocatedQty = 0;

    if (shortMA && longMA && rsi) {
      if (shortMA > longMA && rsi < 70) {
        action = "BUY";
        entry = price.toFixed(2);
        sl = (price * 0.997).toFixed(2);
        tp = (price * 1.01).toFixed(2);
        allocatedQty = (simulatedWallet / price * 0.1).toFixed(3);
        positions[sym] = { entry: price, qty: allocatedQty };
      } else if (shortMA < longMA && rsi > 30) {
        action = "SELL";
        entry = price.toFixed(2);
        sl = (price * 1.003).toFixed(2);
        tp = (price * 0.99).toFixed(2);
        allocatedQty = (simulatedWallet / price * 0.1).toFixed(3);
        positions[sym] = { entry: price, qty: allocatedQty };
      }
    }

    // === PnL + Vault logic ===
    let profit = 0;
    if (positions[sym]) {
      const pos = positions[sym];
      profit = (price - pos.entry) * pos.qty;
      if (profit > 0) {
        lockedVault += profit;
        simulatedWallet += profit;
        positions[sym] = { entry: price, qty: pos.qty }; // reset baseline
      }
    }

    table.push([
      sym,
      action,
      entry,
      sl,
      tp,
      rsi ? rsi.toFixed(2) : "N/A",
      allocatedQty,
      simulatedWallet.toFixed(2),
      simulatedWallet.toFixed(2),
      lockedVault.toFixed(2),
      (simulatedWallet + lockedVault).toFixed(2)
    ]);
  }

  console.clear();
  console.log(table.toString());
}

// === Boot ===
(async () => {
  await preloadHistory();
  for (const sym of symbols) {
    wsClient.subscribeV5(`tickers.${sym}`, "spot");
  }
  setInterval(processSignals, 5000);
})();
