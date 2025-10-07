// bybit-proxy.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());

app.get('/api/*', async (req, res) => {
  const path = req.params[0]; // the API endpoint path
  const query = req.originalUrl.split('?')[1] || '';
  
  try {
    const response = await fetch(`https://api.bybit.com/${path}?${query}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Bybit proxy running on port ${PORT}`));
