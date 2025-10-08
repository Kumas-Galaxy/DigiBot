// ========================================
//  KUMAS DIGIBOT - TESTNET PROXY INTEGRATION
//  WORKS IN NODE & BROWSER AUTOMATICALLY
// ========================================

// Detect environment
const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;

// Set proxy base depending on environment
const proxyBase = isNode
  ? "http://localhost:3001" // Node always uses local proxy
  : (window.location.hostname.includes("localhost")
      ? "http://localhost:3001"
      : "https://kumas-digibot.onrender.com");

console.log("🔗 Using Proxy:", proxyBase);

// === CONFIGURATION ===
const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "LTCUSDT", "XRPUSDT"];
const interval = "1"; // 1-minute candles for demo
const category = "spot";

// === HELPER: Fetch Klines from Proxy ===
async function fetchKlines(symbol) {
  try {
    const url = `${proxyBase}/klines?symbol=${symbol}&interval=${interval}&category=${category}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.result?.list) {
      console.warn(`⚠️ Klines fetch failed for ${symbol}:`, data);
      return [];
    }

    // Parse close prices
    const closes = data.result.list.map(k => parseFloat(k[4])).reverse();
    return closes;
  } catch (err) {
    console.error(`❌ fetchKlines error for ${symbol}:`, err.message);
    return [];
  }
}

// === HELPER: Calculate RSI + EMA ===
function calcEMA(closes, period) {
  let k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a,b) => a+b,0)/period;
  let result = [ema];
  for(let i=period;i<closes.length;i++){
    ema = closes[i]*k + ema*(1-k);
    result.push(ema);
  }
  return result;
}

function calcRSI(closes, period=14){
  let gains=[], losses=[], rsi=[];
  for(let i=1;i<closes.length;i++){
    let change = closes[i]-closes[i-1];
    gains.push(change>0?change:0);
    losses.push(change<0?-change:0);
  }
  for(let i=period-1;i<gains.length;i++){
    let avgGain = gains.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period;
    let avgLoss = losses.slice(i-period+1,i+1).reduce((a,b)=>a+b,0)/period;
    let rs = avgLoss===0?100:avgGain/avgLoss;
    rsi.push(100-(100/(1+rs)));
  }
  return rsi;
}

// === CORE ENGINE ===
async function runDigiBot(){
  console.clear();
  console.log("🤖 Kumas DigiBot (TESTNET) - EMA+RSI Dynamic Hybrid\n");

  const table = [];

  for(const symbol of symbols){
    const closes = await fetchKlines(symbol);

    if(closes.length===0){
      table.push({ Pair:symbol, Price:"N/A", RSI:"-", EMA9:"-", EMA21:"-", Signal:"NO DATA" });
      continue;
    }

    const price = closes[closes.length-1];
    const ema9 = calcEMA(closes,9).slice(-1)[0];
    const ema21 = calcEMA(closes,21).slice(-1)[0];
    const rsi = calcRSI(closes,14).slice(-1)[0];

    let signal="WAIT";
    if(rsi<30 && ema9>ema21) signal="BUY";
    else if(rsi>70 && ema9<ema21) signal="SELL";

    table.push({
      Pair:symbol,
      Price: price.toFixed(4),
      RSI: rsi?.toFixed(2)||"-",
      EMA9: ema9?.toFixed(4)||"-",
      EMA21: ema21?.toFixed(4)||"-",
      Signal: signal
    });
  }

  console.table(table);
  console.log("\n✅ Data fetched from Bybit Testnet via proxy.\n");
}

// === LOOP EVERY 60s ===
runDigiBot();
setInterval(runDigiBot,60000);
