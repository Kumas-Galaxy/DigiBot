// server.js — Render-Ready DigiBot Server

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "./telegram.js"; // make sure telegram.js exists in same folder

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fix __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Route for dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Health check route (for Render)
app.get("/healthz", (req, res) => res.json({ status: "DigiBot alive ✅" }));

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DigiBot server running on port ${PORT}`);
});
