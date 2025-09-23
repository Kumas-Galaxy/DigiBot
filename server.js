import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Serve static files
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

// ✅ Route for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});
// --- Bybit Proxy Example ---
const API_KEY = process.env.BYBIT_API_KEY;
const API_SECRET = process.env.BYBIT_API_SECRET;
const BASE_URL = process.env.BYBIT_TESTNET === "true"
  ? "https://api-testnet.bybit.com"
  : "https://api.bybit.com";

function signRequest(params) {
  const ordered = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHmac("sha256", API_SECRET).update(ordered).digest("hex");
}

// Example route: fetch account balance
app.get("/api/balance", async (req, res) => {
  try {
    const timestamp = Date.now().toString();
    const params = {
      api_key: API_KEY,
      timestamp,
    };
    params.sign = signRequest(params);

    const response = await axios.get(`${BASE_URL}/v2/private/wallet/balance`, {
      params,
    });

    res.json(response.data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bybit API error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `Bybit proxy server running on port ${PORT} (testnet=${process.env.BYBIT_TESTNET})`
  );
});
