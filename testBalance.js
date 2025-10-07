import axios from "axios";
import crypto from "crypto";

const API_KEY = "XyKdSL4ZfWBL7Sb2Hw";
const API_SECRET = "zZmno2zDRFKIFbO7nDoQnqH3Y6nFhh9Pd4p5";

// Signature generator
function getSignature(params, secret) {
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(k => `${k}=${params[k]}`).join("&");
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function getAllBalances() {
  const endpoint = "https://api.bybit.com/v5/account/wallet-balance";

  const timestamp = Date.now().toString();
  const params = {
    api_key: API_KEY,
    timestamp,
    recv_window: 10000,
    accountType: "UNIFIED" // unified wallet includes spot + derivatives
  };

  params.sign = getSignature(params, API_SECRET);

  try {
    const res = await axios.get(endpoint, { params });
    const wallets = res.data.result.list;

    if (!wallets || wallets.length === 0) {
      console.log("No wallets found in the response.");
      return;
    }

    // Iterate through wallets dynamically
    wallets.forEach(wallet => {
      console.log(`\n=== ${wallet.accountType || wallet.type || "Wallet"} ===`);
      const coins = wallet.coins || wallet.list || wallet.coinList || [];
      if (!coins || coins.length === 0) {
        console.log("No coins found in this wallet.");
      } else {
        coins.forEach(c => {
          console.log(`${c.coin}: ${c.walletBalance || c.wallet_balance || "0"} (USD Value: ${c.usdValue || "0"})`);
        });
      }
    });
  } catch (err) {
    console.error("Error fetching balances:", err.response?.data || err.message);
  }
}

getAllBalances();
