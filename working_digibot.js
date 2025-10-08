// ===============================
// 🤖 DigiBot (TESTNET)
// EMA + RSI Dynamic Hybrid (Scalp / Swing / Hedge)
// Local Proxy Integrated Build — TP/SL Tracking + Vault Protection
// ===============================
import ccxt from 'ccxt';
import chalk from 'chalk';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import Table from 'cli-table3';
// === AUTO-START LOCAL PROXY ===
import './bybit-proxy.js';

dotenv.config();

// === EXCHANGE (TESTNET) VIA LOCAL PROXY ===
const exchange = new ccxt.bybit({
    apiKey: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    enableRateLimit: true,
    options: {
        defaultType: 'spot',
        urls: {
            api: {
                public: 'http://localhost:3001/api',
                private: 'http://localhost:3001/api'
            }
        }
    }
});

// === TELEGRAM SETUP ===
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// === BOT CONFIG ===
let wallet = 1000;
let vault = 0;
let symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'LTC/USDT', 'XRP/USDT'];
let positions = {};
let cycleTime = 60;
let signalWindow = null;
let hourlySignalsSent = false;

// === HELPERS ===
function ema(data, period) {
    const k = 2 / (period + 1);
    let emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
        emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray[data.length - 1];
}

function rsi(values, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function allocateFunds() {
    const perPair = wallet / symbols.length;
    for (let symbol of symbols) {
        positions[symbol] = {
            mode: 'WAIT',
            allocated: perPair,
            pnl: 0,
            vault: 0,
            signal: 'WAIT',
            entry: 0,
            tp: 0,
            sl: 0,
            tpHit: false,
            slHit: false,
            reported: false
        };
    }
}

// === FETCH DATA ===
async function fetchMarketData(symbol) {
  try {
    const cleanSymbol = symbol.replace("/", "");

const url = `http://localhost:3001/klines?symbol=${cleanSymbol}&interval=1`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.result || !json.result.list) {
      console.log(chalk.red(`❌ Invalid kline data for ${symbol}`));
      return null;
    }

    // Bybit returns most recent candles at [0], so reverse to chronological
    const ohlcv = json.result.list.reverse().map(c => [
      Number(c[0]), // timestamp
      Number(c[1]), // open
      Number(c[2]), // high
      Number(c[3]), // low
      Number(c[4]), // close
      Number(c[5])  // volume
    ]);

    const closes = ohlcv.map(c => c[4]);
    const price = closes[closes.length - 1];
    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const rsiValue = rsi(closes);

    console.log(chalk.gray(`📊 ${symbol} price: ${price}, RSI: ${rsiValue.toFixed(2)}`));

    return { price, ema9, ema21, rsiValue };

  } catch (err) {
    console.log(chalk.red(`❌ Error fetching ${symbol}: ${err.message}`));
    return null;
  }
}


// === SIGNAL + MODE ===
function getSignal(ema9, ema21, rsiValue) {
    if (rsiValue > 70 && ema9 < ema21) return 'SELL';
    if (rsiValue < 30 && ema9 > ema21) return 'BUY';
    return 'WAIT';
}

function selectMode(rsiValue) {
    if (rsiValue >= 70) return 'HEDGE';
    if (rsiValue <= 30) return 'SCALP';
    return 'SWING';
}

// === TELEGRAM SIGNALS ===
async function sendHourlySignals(signals) {
    let msg = `📢 <b>DigiBot (TESTNET) - EMA+RSI Hybrid</b>\n🕐 <i>Hourly Trading Signals (5)</i>\n\n`;
    for (const s of signals) {
        const arrow = s.signal === 'BUY' ? '🔼' : s.signal === 'SELL' ? '🔽' : '⏸';
        msg += `💎 <b>${s.symbol}</b> (${s.mode})\n` +
               `💰 Entry: ${s.price.toFixed(6)} | RSI: ${s.rsiValue.toFixed(2)}\n` +
               `EMA9: ${s.ema9.toFixed(6)} | EMA21: ${s.ema21.toFixed(6)}\n` +
               `📊 Signal: <b>${s.signal}</b> ${arrow}\n` +
               `🎯 TP: ${(s.tp ?? s.price * 1.01).toFixed(6)} | ⚠️ SL: ${(s.sl ?? s.price * 0.99).toFixed(6)}\n\n`;
    }
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
    console.log(chalk.green(`✅ Sent hourly trade signals to Telegram.`));
}

async function sendLockedProfitReport(p) {
    const trend = p.ema9 > p.ema21 ? 'Uptrend 🔼' : 'Downtrend 🔽';
    const msg = 
        `💎 <b>Profit Locked!</b> ${p.symbol}\n\n` +
        `💰 +$${p.vault.toFixed(2)} locked | Mode: ${p.mode}\n` +
        `Entry: ${p.entry?.toFixed(6)} | TP: ${p.tp.toFixed(6)} | SL: ${p.sl.toFixed(6)}\n` +
        `RSI: ${p.rsiValue.toFixed(2)} | EMA9: ${p.ema9.toFixed(6)} | EMA21: ${p.ema21.toFixed(6)}\n` +
        `📈 Trend: ${trend}\n\n` +
        `🧠 <i>Technical Summary:</i>\n` +
        (p.rsiValue > 70 ? "RSI reached overbought region, prompting partial exit.\n" :
         p.rsiValue < 30 ? "RSI oversold recovery detected, trend reversal likely.\n" :
         "EMA cross suggests sideways consolidation.\n") +
        `🔒 Total Vault: $${vault.toFixed(2)}`;
    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
    console.log(chalk.cyan(`📩 Locked profit report sent for ${p.symbol}`));
}

// === MAIN LOOP ===
async function runBot() {
    console.clear();
    console.log(chalk.cyan.bold(`🤖 DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid (Scalp / Swing / Hedge)\n`));

    const now = new Date();
    const currentHour = now.getHours();
    if (signalWindow !== currentHour) {
        signalWindow = currentHour;
        hourlySignalsSent = false;
    }

    const table = new Table({
        head: ['Pair','Mode','Price','RSI','EMA9','EMA21','Signal','TP/SL','PnL','Vault'],
        style: { head: [], border: [] }
    });

    let hourlyBatch = [];
    let totalVault = 0;
    let totalPnL = 0;
    let totalAlloc = 0;

    for (let symbol of symbols) {
        const data = await fetchMarketData(symbol);
        if (!data) continue;

        const { price, ema9, ema21, rsiValue } = data;
        const mode = selectMode(rsiValue);
        const signal = getSignal(ema9, ema21, rsiValue);
        const alloc = positions[symbol]?.allocated || 0;

        if (!positions[symbol].entry) {
            positions[symbol].entry = price;
            positions[symbol].tp = price * 1.01;
            positions[symbol].sl = price * 0.99;
        }

        let pnlChange = signal === 'BUY' ? Math.random() * 1.5 : signal === 'SELL' ? -(Math.random() * 1.5) : 0;
        positions[symbol].pnl += pnlChange;

        let status = '---';
        if (price >= positions[symbol].tp) {
            status = 'TP HIT ✅';
            positions[symbol].vault += Math.max(positions[symbol].pnl, 0);
            vault += Math.max(positions[symbol].pnl, 0);
            wallet += Math.max(positions[symbol].pnl, 0);
            await sendLockedProfitReport({ symbol, ...data, mode, ...positions[symbol] });
            positions[symbol].pnl = 0;
            positions[symbol].entry = price;
            positions[symbol].tp = price * 1.01;
            positions[symbol].sl = price * 0.99;
        } else if (price <= positions[symbol].sl) {
            status = 'SL HIT ❌';
            positions[symbol].pnl = 0;
            positions[symbol].entry = price;
            positions[symbol].tp = price * 1.01;
            positions[symbol].sl = price * 0.99;
        }

        totalVault += positions[symbol].vault;
        totalPnL += positions[symbol].pnl;
        totalAlloc += alloc;

        table.push([
            symbol.replace('/USDT', 'USDT'),
            mode,
            price.toFixed(6),
            rsiValue.toFixed(2),
            ema9.toFixed(6),
            ema21.toFixed(6),
            signal,
            status,
            `${positions[symbol].pnl.toFixed(2)}%`,
            `$${positions[symbol].vault.toFixed(2)}`
        ]);

        hourlyBatch.push({ symbol, price, ema9, ema21, rsiValue, signal, mode, tp: positions[symbol].tp, sl: positions[symbol].sl });
    }

    console.log(table.toString());
    console.log(
        `\n💰 Wallet: ${wallet.toFixed(2)} | Vault: ${vault.toFixed(2)} | PnL: ${totalPnL.toFixed(2)} | Alloc: ${totalAlloc.toFixed(2)}\n`
    );

    if (!hourlySignalsSent && hourlyBatch.length >= 5) {
        await sendHourlySignals(hourlyBatch.slice(0, 5));
        hourlySignalsSent = true;
    }

    for (let i = cycleTime; i >= 0; i--) {
        process.stdout.write(`⏳ Next cycle in ${i}s...\r`);
        await new Promise(r => setTimeout(r, 1000));
    }

    runBot();
}

// === INIT ===
allocateFunds();
runBot();
