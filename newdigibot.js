// ===============================
// 🤖 DigiBot (TESTNET)
// EMA + RSI Dynamic Hybrid (Scalp / Swing / Hedge)
// ===============================
import ccxt from 'ccxt';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

const exchange = new ccxt.bybit({
    apiKey: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    enableRateLimit: true,
    options: { defaultType: 'spot' }
});

// === BOT CONFIG ===
let wallet = 1000;
let vault = 0;
let symbols = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'LTC/USDT', 'XRP/USDT'];
let positions = {};
let cycleTime = 60; // seconds

// === HELPER FUNCTIONS ===
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
        positions[symbol] = { mode: 'WAIT', allocated: perPair, pnl: 0, vault: 0, lastSignal: 'WAIT' };
    }
}

// === FETCH MARKET DATA ===
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

// === MAIN EXECUTION LOOP ===
async function runBot() {
    console.clear();
    console.log(chalk.cyan.bold(`🤖 DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid (Scalp / Swing / Hedge)\n`));

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

        // Simulated PnL movement (demo)
        let pnlChange = 0;
        if (signal === 'BUY') pnlChange = (Math.random() * 1.5);
        else if (signal === 'SELL') pnlChange = -(Math.random() * 1.5);
        positions[symbol].pnl += pnlChange;

        // === PAIR-SPECIFIC VAULT MANAGEMENT ===
        if (!positions[symbol].vault) positions[symbol].vault = 0;

        if (positions[symbol].pnl >= 1) {
            positions[symbol].vault += positions[symbol].pnl;
            wallet += positions[symbol].pnl;
            console.log(chalk.green(`💰 ${symbol} locked $${positions[symbol].pnl.toFixed(2)} profit to vault!`));
            positions[symbol].pnl = 0;
        }

        if (positions[symbol].pnl <= -2) {
            wallet += positions[symbol].pnl;
            console.log(chalk.red(`⚠️ ${symbol} loss of $${positions[symbol].pnl.toFixed(2)} applied.`));
            positions[symbol].pnl = 0;
        }

        totalVault += positions[symbol].vault;
        totalPnL += positions[symbol].pnl;
        totalAlloc += alloc;

        positions[symbol] = { ...positions[symbol], mode, price, ema9, ema21, rsiValue, signal, allocated: alloc };
    }

    // === TABLE DISPLAY ===
    const table = Object.entries(positions).map(([symbol, d]) => ({
        Symbol: symbol.replace('/USDT', 'USDT'),
        Mode: d.mode,
        Price: d.price?.toFixed(2) || '-',
        RSI: d.rsiValue?.toFixed(2) || '-',
        EMA9: d.ema9?.toFixed(2) || '-',
        EMA21: d.ema21?.toFixed(2) || '-',
        Signal: d.signal,
        'PnL%': d.pnl?.toFixed(2) + '%',
        Allocated: `$${d.allocated?.toFixed(2)}`,
        Vault: `$${d.vault?.toFixed(2)}`
    }));

    console.table(table);
    const freeBalance = wallet - totalAlloc;
    console.log(`💰 Wallet: ${wallet.toFixed(2)} USDT | 🧩 Allocated: ${totalAlloc.toFixed(2)} | 🆓 Free: ${freeBalance.toFixed(2)} | 📊 Equity: ${(wallet + totalPnL).toFixed(2)} | 🔒 Vault: ${totalVault.toFixed(2)}\n`);

    // === LIVE COUNTDOWN ===
    for (let i = cycleTime; i >= 0; i--) {
        process.stdout.write(`⏳ Next cycle in ${i}s...\r`);
        await new Promise(r => setTimeout(r, 1000));
    }

    runBot(); // loop again
}

// === INITIALIZATION ===
allocateFunds();
runBot();
