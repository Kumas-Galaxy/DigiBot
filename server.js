import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "./digibot.js";
// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (so your HTML, CSS, JS work)
app.use(express.static(__dirname));

// Route for dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Optional: API test route
app.get("/api/ping", (req, res) => {
  res.json({ message: "DigiBot backend is alive ⚡" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DigiBot server running on port ${PORT}`);
});
