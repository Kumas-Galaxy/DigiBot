// ===============================
// 🤖 DigiBot (TESTNET)
// EMA + RSI Dynamic Hybrid (Scalp / Swing / Hedge)
// Two Telegram Signal Types: 5/hour + Locked Profit
// ===============================
import ccxt from 'ccxt';
import chalk from 'chalk';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
dotenv.config();

// === EXCHANGE (TESTNET) ===
const exchange = new ccxt.bybit({
    apiKey: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    enableRateLimit: true,
    options: { defaultType: 'spot', urls: { api: { public: 'https://api-testnet.bybit.com', private: 'https://api-testnet.bybit.com' } } }
});

// === TELEGRAM SETUP ===
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// === BOT CONFIG ===
let wallet = 1000;
let vault = 0;
let symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'LTC/USDT', 'XRP/USDT'];
let positions = {};
let cycleTime = 60; // seconds
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
            reported: false
        };
    }
}

// === FETCH DATA ===
async function fetchMarketData(symbol) {
    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 30);
        const closes = ohlcv.map(c => c[4]);
        const price = closes[closes.length - 1];
        const ema9 = ema(closes, 9);
        const ema21 = ema(closes, 21);
        const rsiValue = rsi(closes);
        return { price, ema9, ema21, rsiValue };
    } catch (err) {
        console.log(chalk.red(`❌ Error fetching ${symbol}: ${err.message}`));
        return null;
    }
}

// === TRADE LOGIC ===
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

// === TELEGRAM SIGNAL SENDER ===
async function sendHourlySignals(signals) {
    let msg = `📢 <b>DigiBot (TESTNET) - EMA+RSI Hybrid</b>\n🕐 <i>Hourly Trading Signals (5)</i>\n\n`;

    for (const s of signals) {
        const arrow = s.signal === 'BUY' ? '🔼' : s.signal === 'SELL' ? '🔽' : '⏸';
        msg += `💎 <b>${s.symbol}</b> (${s.mode})\n` +
               `💰 Price: ${s.price.toFixed(2)} | RSI: ${s.rsiValue.toFixed(2)}\n` +
               `EMA9: ${s.ema9.toFixed(2)} | EMA21: ${s.ema21.toFixed(2)}\n` +
               `📊 Signal: <b>${s.signal}</b> ${arrow}\n\n`;
    }

    await bot.sendMessage(CHAT_ID, msg, { parse_mode: 'HTML' });
    console.log(chalk.green(`✅ Sent 5 hourly trade signals to Telegram.`));
}

async function sendLockedProfitReport(p) {
    const trend = p.ema9 > p.ema21 ? 'Uptrend 🔼' : 'Downtrend 🔽';
    const msg =
        `💎 <b>Profit Locked!</b> ${p.symbol}\n\n` +
        `💰 +$${p.vault.toFixed(2)} locked | Mode: ${p.mode}\n` +
        `RSI: ${p.rsiValue.toFixed(2)} | EMA9: ${p.ema9.toFixed(2)} | EMA21: ${p.ema21.toFixed(2)}\n` +
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
        let pnlChange = 0;

        if (signal === 'BUY') pnlChange = (Math.random() * 1.5);
        else if (signal === 'SELL') pnlChange = -(Math.random() * 1.5);

        positions[symbol].pnl += pnlChange;
        if (!positions[symbol].vault) positions[symbol].vault = 0;

        if (positions[symbol].pnl >= 1 && !positions[symbol].reported) {
            positions[symbol].vault += positions[symbol].pnl;
            wallet += positions[symbol].pnl;
            vault += positions[symbol].pnl;
            await sendLockedProfitReport({ symbol, ...data, mode, vault: positions[symbol].pnl });
            positions[symbol].reported = true;
            positions[symbol].pnl = 0;
        }

        if (positions[symbol].pnl <= -2) {
            wallet += positions[symbol].pnl;
            positions[symbol].pnl = 0;
        }

        totalVault += positions[symbol].vault;
        totalPnL += positions[symbol].pnl;
        totalAlloc += alloc;

        const trend = ema9 > ema21 ? '📈' : ema9 < ema21 ? '📉' : '⏸';
        const signalColor =
            signal === 'BUY' ? chalk.green(signal) :
            signal === 'SELL' ? chalk.red(signal) :
            chalk.yellow(signal);
        const modeColor =
            mode === 'HEDGE' ? chalk.red(mode) :
            mode === 'SCALP' ? chalk.green(mode) :
            chalk.cyan(mode);
        const pnlColor =
            positions[symbol].pnl > 0 ? chalk.green(`${positions[symbol].pnl.toFixed(2)}%`) :
            positions[symbol].pnl < 0 ? chalk.red(`${positions[symbol].pnl.toFixed(2)}%`) :
            chalk.white(`${positions[symbol].pnl.toFixed(2)}%`);

        console.log(
            `${chalk.white(symbol.replace('/USDT', 'USDT'))} | ${modeColor} | 💰 ${chalk.white(price.toFixed(2))} | ` +
            `RSI ${chalk.magenta(rsiValue.toFixed(2))} | EMA9 ${chalk.white(ema9.toFixed(2))} | EMA21 ${chalk.white(ema21.toFixed(2))} | ` +
            `${signalColor} ${trend} | PnL ${pnlColor} | Vault ${chalk.green(`$${positions[symbol].vault.toFixed(2)}`)}`
        );

        hourlyBatch.push({ symbol, price, ema9, ema21, rsiValue, signal, mode });
        positions[symbol] = { ...positions[symbol], mode, price, ema9, ema21, rsiValue, signal, allocated: alloc };
    }

    const freeBalance = wallet - totalAlloc;
    const equity = wallet + totalPnL;
    console.log(chalk.bold(`\n💰 Wallet: ${wallet.toFixed(2)} USDT | 🧩 Allocated: ${totalAlloc.toFixed(2)} | 🆓 Free: ${freeBalance.toFixed(2)} | 📊 Equity: ${equity.toFixed(2)} | 🔒 Vault: ${vault.toFixed(2)}\n`));

    if (!hourlySignalsSent && hourlyBatch.length >= 5) {
        const bestFive = hourlyBatch.slice(0, 5);
        await sendHourlySignals(bestFive);
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
