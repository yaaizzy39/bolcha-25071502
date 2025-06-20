// Cloud Functions for Bolcha - translation proxy to GAS
import fetch from 'node-fetch';
import functions from 'firebase-functions';

// Replace with your GAS deployment ID via env or constant
const GAS_BASE_URL = process.env.GAS_BASE_URL || 'https://script.google.com/macros/s/AKfycbwD3O1N6IQWW_07H6cWiqx8FN-5u1CAOTHb2wmky1c1tgmOT7bO-if08gE49p3zenVO8A/exec';

export const translate = functions.https.onRequest(async (req, res) => {
  // universal CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  const textParam = req.method === 'GET' ? (req.query.text || req.query.q) : (req.body.text || req.body.q);
  const text = Array.isArray(textParam) ? textParam[0] : textParam;
  if (!text) {
    res.status(400).json({ error: 'text required' });
    return;
  }
  const target = (req.method === 'GET' ? req.query.target : req.body.target) || 'en';

  try {
    const url = `${GAS_BASE_URL}?text=${encodeURIComponent(text)}&target=${encodeURIComponent(target)}`;
    const r = await fetch(url);
    const json = await r.json();
    res.set('Access-Control-Allow-Origin', '*');
    res.json(json);
  } catch (err) {
    console.error('translate proxy error', err);
    res.set('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'translation failed' });
  }
});
