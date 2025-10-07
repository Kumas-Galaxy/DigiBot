import crypto from "crypto";
import fetch from "node-fetch";

const API_KEY = "XyKdSL4ZfWBL7Sb2Hw";
const API_SECRET = "zZmno2zDRFKIFbO7nDoQnqH3Y6nFhh9Pd4p5";

async function getBalance() {
  const url = "https://api.bybit.com/v5/account/wallet-balance";
  const timestamp = Date.now().toString();

  const params = {
    api_key: API_KEY,
    timestamp,
  };

  // Create signature
  const paramStr = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const sign = crypto
    .createHmac("sha256", API_SECRET)
    .update(paramStr)
    .digest("hex");

  const finalParams = { ...params, sign };

  const query = new URLSearchParams(finalParams).toString();
  const resp = await fetch(`${url}?${query}`);
  const data = await resp.json();
  console.log(data);
}

getBalance().catch(console.error);
