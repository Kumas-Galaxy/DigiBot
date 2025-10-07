// classic_balance.js
import axios from "axios";
import crypto from "crypto";

// ==== CONFIG ====
const apiKey = "NTBVgsKr4DzYkvlsvs";
const apiSecret = "QdbP6xqXPSeN689Y4QEp47Ec1QPEJ9ripSSG";
const recvWindow = 10000;

// ==== SIGNATURE FUNCTION ====
function sign(query, secret) {
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}

// ==== MAIN ====
(async () => {
  const endpoint = "https://api.bybit.com/v5/asset/transfer/query-asset-info";
  const timestamp = Date.now().toString();

  const query = `api_key=${apiKey}&recv_window=${recvWindow}&timestamp=${timestamp}`;
  const signature = sign(query, apiSecret);
  const url = `${endpoint}?${query}&sign=${signature}`;

  try {
    const res = await axios.get(url);
    console.log("🔎 Raw Response:", JSON.stringify(res.data, null, 2));

    const usdtObj = res.data.result.find(item => item.coin === "USDT");
    console.log("💰 USDT Balance:", usdtObj ? usdtObj.walletBalance : 0);

  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
})();









