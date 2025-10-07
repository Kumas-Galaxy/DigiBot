// check_key.js
import axios from "axios";
import crypto from "crypto";

const apiKey = process.env.BYBIT_API_KEY || "NTBVgsKr4DzYkvlsvs";
const apiSecret = process.env.BYBIT_API_SECRET || "QdbP6xqXPSeN689Y4QEp47Ec1QPEJ9ripSSG";
const recvWindow = 10000;
const timestamp = Date.now().toString();

function getSignature(secret, payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function checkApiKey() {
  try {
    const payload = timestamp + apiKey + recvWindow; // No body for GET
    const sign = getSignature(apiSecret, payload);

    const res = await axios.get("https://api.bybit.com/v5/account/info", {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-SIGN": sign,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-RECV-WINDOW": recvWindow,
      },
    });

    console.log("✅ API Key Info:");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("❌ API Key Check Error:", err.response?.data || err.message);
  }
}

checkApiKey();












