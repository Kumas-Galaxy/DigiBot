import axios from "axios";

(async () => {
  try {
    const res = await axios.get("https://api.bybit.com/v5/market/time");
    console.log("✅ Bybit API reachable:", res.data);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
