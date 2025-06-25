// Cloud Functions for Bolcha - translation proxy to GAS
import fetch from 'node-fetch';
import functions from 'firebase-functions';
import admin from 'firebase-admin';
admin.initializeApp();

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

// ================= Admin callable =================
export const adminDeleteRoom = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const email = context.auth.token.email;
  const isClaimAdmin = !!context.auth.token.admin;
  let adminEmails = (functions.config().admin?.emails || '').split(/[, ]+/).filter(Boolean);
  try {
    const cfgSnap = await admin.firestore().doc('admin/config').get();
    if (cfgSnap.exists) {
      const cfgEmails = cfgSnap.data().adminEmails || [];
      adminEmails = Array.from(new Set([...adminEmails, ...cfgEmails]));
    }
  } catch (e) {
    console.warn('Failed to load admin/config for adminDeleteRoom', e);
  }
  if (!isClaimAdmin && !adminEmails.includes(email)) {
    throw new functions.https.HttpsError('permission-denied', 'Admins only');
  }
  const roomId = data.roomId;
  if (!roomId) {
    throw new functions.https.HttpsError('invalid-argument', 'roomId required');
  }
  const ref = admin.firestore().doc(`rooms/${roomId}`);
  try {
    await admin.firestore().recursiveDelete(ref);
    return { success: true };
  } catch (err) {
    console.error('Failed to delete room', roomId, err);
    throw new functions.https.HttpsError('internal', 'Delete failed');
  }
});

// ===== Additional translation proxy (translate2) =====

// Scheduled function to auto-delete inactive rooms
export const autoDeleteRooms = functions.pubsub.schedule('every 60 minutes').onRun(async (context) => {
  const configSnap = await admin.firestore().doc('admin/config').get();
  const config = configSnap.data() || {};
  const hours = typeof config.autoDeleteHours === 'number' ? config.autoDeleteHours : 24;
  if (!hours || hours <= 0) return null;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const roomsSnap = await admin.firestore().collection('rooms').get();
  let deleted = 0;
  for (const doc of roomsSnap.docs) {
    const last = doc.data().lastActivityAt;
    let t = null;
    if (!last) continue;
    t = last.toDate ? last.toDate().getTime() : new Date(last).getTime();
    if (t < cutoff) {
      await admin.firestore().recursiveDelete(doc.ref);
      deleted++;
      console.log('Auto-deleted room:', doc.id);
    }
  }
  console.log(`Auto-delete done. Deleted ${deleted} rooms.`);
  return null;
});

// To set a distinct GAS endpoint run:
//   firebase functions:config:set translate2.gas_url="https://script.google.com/.../exec"
// If not set, falls back to GAS_BASE_URL or process.env.GAS_BASE_URL_2.
const GAS_BASE_URL_2 = (functions.config().translate2?.gas_url ?? process.env.GAS_BASE_URL_2 ?? GAS_BASE_URL);

export const translate2 = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
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
    const url = `${GAS_BASE_URL_2}?text=${encodeURIComponent(text)}&target=${encodeURIComponent(target)}`;
    const r = await fetch(url);
    const json = await r.json();
    res.json(json);
  } catch (err) {
    console.error('translate2 proxy error', err);
    res.status(500).json({ error: 'translation failed' });
  }
});
