// Cloud Functions for Bolcha - translation proxy to GAS
import fetch from 'node-fetch';
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import admin from 'firebase-admin';

admin.initializeApp();

// Replace with your GAS deployment ID via env or constant
const GAS_BASE_URL = process.env.GAS_BASE_URL || 'https://script.google.com/macros/s/AKfycbwD3O1N6IQWW_07H6cWiqx8FN-5u1CAOTHb2wmky1c1tgmOT7bO-if08gE49p3zenVO8A/exec';

// v2 onRequest provides built-in CORS support
export const translate = onRequest({ cors: true }, async (req, res) => {
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
    res.json(json);
  } catch (err) {
    logger.error('translate proxy error', err);
    res.status(500).json({ error: 'translation failed' });
  }
});

// ================= Admin callable =================
export const adminDeleteRoom = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const email = request.auth.token.email;
  const isClaimAdmin = !!request.auth.token.admin;
  // v2 functions prefer environment variables over functions.config()
  let adminEmails = (process.env.ADMIN_EMAILS || '').split(/[, ]+/).filter(Boolean);
  try {
    const cfgSnap = await admin.firestore().doc('admin/config').get();
    if (cfgSnap.exists) {
      const cfgEmails = cfgSnap.data().adminEmails || [];
      adminEmails = Array.from(new Set([...adminEmails, ...cfgEmails]));
    }
  } catch (e) {
    logger.warn('Failed to load admin/config for adminDeleteRoom', e);
  }
  if (!isClaimAdmin && !adminEmails.includes(email)) {
    throw new HttpsError('permission-denied', 'Admins only');
  }
  const roomId = request.data.roomId;
  if (!roomId) {
    throw new HttpsError('invalid-argument', 'roomId required');
  }
  const ref = admin.firestore().doc(`rooms/${roomId}`);
  try {
    await admin.firestore().recursiveDelete(ref);
    return { success: true };
  } catch (err) {
    logger.error('Failed to delete room', roomId, err);
    throw new HttpsError('internal', 'Delete failed');
  }
});

// ===== Additional translation proxy (translate2) =====

// Scheduled function to auto-delete inactive rooms (v2 syntax)
export const autoDeleteRooms = onSchedule({ region: 'asia-northeast1', timeoutSeconds: 540, schedule: 'every 5 minutes' }, async (event) => {
  logger.log('autoDeleteRooms function started.');
  let hours = 24;
  try {
      const configSnap = await admin.firestore().doc('admin/config').get();
      const config = configSnap.data() || {};
      if (typeof config.autoDeleteHours === 'number') {
          hours = config.autoDeleteHours;
      }
  } catch(e) {
      logger.error("Could not fetch admin/config, falling back to default 24 hours", e);
  }

  logger.log(`Configured autoDeleteHours: ${hours}`);
  if (!hours || hours <= 0) {
    logger.log('Auto-delete is disabled or hours is invalid.');
    return null;
  }
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  logger.log(`Cutoff timestamp: ${new Date(cutoff).toISOString()}`);
  const roomsSnap = await admin.firestore().collection('rooms').get();
  logger.log(`Found ${roomsSnap.size} rooms to check.`);
  let deleted = 0;
  for (const doc of roomsSnap.docs) {
    const last = doc.data().lastActivityAt;
    logger.log(`Room ${doc.id} raw lastActivityAt: ${JSON.stringify(last)}, type: ${typeof last}`);
    let t = null;
    if (!last) {
      try {
        const timestampFromId = new Date(parseInt(doc.id.substring(0, 8), 16) * 1000);
        t = timestampFromId.getTime();
        logger.log(`Room ${doc.id} has no lastActivityAt. Falling back to create time: ${timestampFromId.toISOString()}`);
      } catch (e) {
        logger.log(`Room ${doc.id} has no lastActivityAt and failed to parse ID. Skipping.`);
        continue;
      }
    } else if (typeof last.toDate === 'function') {
      t = last.toDate().getTime();
    } else if (typeof last === 'object' && last._seconds) {
      t = last._seconds * 1000 + (last._nanoseconds || 0) / 1000000;
    } else {
      t = new Date(last).getTime();
    }

    if (isNaN(t)) {
      logger.log(`Room ${doc.id} has an invalid lastActivityAt format. Skipping.`);
      continue;
    }
    logger.log(`Checking room ${doc.id}: lastActivityAt=${new Date(t).toISOString()}, cutoff=${new Date(cutoff).toISOString()}`);
    if (t < cutoff) {
      await admin.firestore().recursiveDelete(doc.ref);
      deleted++;
      logger.log('Auto-deleted room:', doc.id);
    }
  }
  logger.log(`Auto-delete done. Deleted ${deleted} rooms.`);
  return null;
});

// To set a distinct GAS endpoint, use environment variables e.g. GAS_BASE_URL_2
const GAS_BASE_URL_2 = process.env.GAS_BASE_URL_2 ?? GAS_BASE_URL;

export const translate2 = onRequest({ cors: true }, async (req, res) => {
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
    logger.error('translate2 proxy error', err);
    res.status(500).json({ error: 'translation failed' });
  }
});
