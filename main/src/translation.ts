// Utility to call custom GAS translation API endpoints in a round-robin fashion
// GAS endpoint list is provided via `VITE_GAS_ENDPOINTS` (comma-separated URLs)
// Additionally, admin can manage endpoints via Firestore doc `admin/config` field `gasEndpoints`.


const initialEndpoints = (import.meta.env.VITE_GAS_ENDPOINTS as string | undefined)
  ?.split(/[, ]+/)
  .filter(Boolean) || [];

const endpoints: {url: string, enabled: boolean}[] = initialEndpoints.map(url => ({ url, enabled: true }));

import { db, auth } from "./firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

let primary = 0;           // index of the preferred endpoint
let failStreak = 0;        // consecutive failures of the current primary
const FAIL_THRESHOLD = 2;  // switch primary after this many consecutive failures

// simple promise queue to ensure only one request at a time
let chain: Promise<any> = Promise.resolve();

// ---------- Simple client-side cache (sessionStorage + in-memory) ----------
const CACHE_KEY = 'tranCache';
const _initCache: Record<string, string> = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
})();
const cache = new Map<string, string>(Object.entries(_initCache));
function saveCache() {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* ignore quota errors */
  }
}

// Runtime load of endpoints from Firestore (admin-configurable)
if (!(globalThis as any).__TRAN_CFG_LISTENER__) {
  (globalThis as any).__TRAN_CFG_LISTENER__ = true;
  try {

  onAuthStateChanged(auth, (user) => {
    if (!user) return; // wait until sign-in
    const cfgRef = doc(db, "admin", "publicConfig");
    onSnapshot(
      cfgRef,
      (snap) => {
      const data = snap.data();
      if (data && Array.isArray(data.gasEndpoints)) {
        if (data.gasEndpoints.length) {
          // Handle both old format (string array) and new format (object array)
          const gasEndpoints = data.gasEndpoints;
          if (typeof gasEndpoints[0] === 'string') {
            // Convert old format to new format
            endpoints.splice(0, endpoints.length, ...gasEndpoints.map((url: string) => ({ url, enabled: true })));
          } else {
            endpoints.splice(0, endpoints.length, ...gasEndpoints);
          }
          console.info("[translation] endpoints updated from Firestore", endpoints);
        } else {
          endpoints.splice(0, endpoints.length, ...initialEndpoints.map(url => ({ url, enabled: true })));
          console.info("[translation] endpoints reset to .env list", endpoints);
        }
        primary = 0;
        failStreak = 0;
      }
      },
      (err) => {
        if (err.code === 'permission-denied') {
        } else {
        }
      }
    );
  });
} catch {
  /* ignore if Firebase not ready */
}
}


// Try translating via one endpoint: POST first, then GET fallback
async function attemptTranslate(
  url: string,
  text: string,
  targetLang: string
): Promise<string | null> {
  try {
    const postRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetLang }),
    });
    if (postRes.ok) {
      const maybeJson = await safeParse(postRes);
      return handleResult(maybeJson, text);
    }
  } catch (e) {
  }

  try {
    const params = new URLSearchParams({ text, target: targetLang });
    const getRes = await fetch(`${url}?${params.toString()}`);
    if (getRes.ok) {
      const maybeJson = await safeParse(getRes);
      return handleResult(maybeJson, text);
    }
  } catch (e) {
  }
  return null;
}

// Try translating via one endpoint: POST first, then GET fallback (Raw version without preserveBlankLines)
async function attemptTranslateRaw(
  url: string,
  text: string,
  targetLang: string
): Promise<string | null> {
  try {
    const postRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetLang }),
    });
    if (postRes.ok) {
      const maybeJson = await safeParse(postRes);
      return handleResultRaw(maybeJson);
    }
  } catch (e) {
  }

  try {
    const params = new URLSearchParams({ text, target: targetLang });
    const getRes = await fetch(`${url}?${params.toString()}`);
    if (getRes.ok) {
      const maybeJson = await safeParse(getRes);
      return handleResultRaw(maybeJson);
    }
  } catch (e) {
  }
  return null;
}

async function doTranslate(text: string, targetLang: string): Promise<string | null> {
  const enabledEndpoints = endpoints.filter(ep => ep.enabled);
  if (!enabledEndpoints.length) {
    return null;
  }
  // Iterate over enabled endpoints, starting with the current primary, until one succeeds
  for (let i = 0; i < enabledEndpoints.length; i++) {
    const idx = (primary + i) % enabledEndpoints.length;
    const endpoint = enabledEndpoints[idx];

    const maybe = await attemptTranslate(endpoint.url, text, targetLang);
    if (maybe !== null) {
      // Success → promote this index to be the primary
      primary = idx;
      failStreak = 0;
      return maybe;
    }
  }

  // All enabled endpoints failed this round
  failStreak += 1;
  if (failStreak >= FAIL_THRESHOLD) {
    primary = (primary + 1) % enabledEndpoints.length; // shift to next endpoint
    failStreak = 0;
  }
  return null;
}

// Function specifically for translating individual lines (bypasses preserveBlankLines)
async function doTranslateLine(text: string, targetLang: string): Promise<string | null> {
  const enabledEndpoints = endpoints.filter(ep => ep.enabled);
  if (!enabledEndpoints.length) {
    return null;
  }
  // Iterate over enabled endpoints, starting with the current primary, until one succeeds
  for (let i = 0; i < enabledEndpoints.length; i++) {
    const idx = (primary + i) % enabledEndpoints.length;
    const endpoint = enabledEndpoints[idx];

    const maybe = await attemptTranslateRaw(endpoint.url, text, targetLang);
    if (maybe !== null) {
      // Success → promote this index to be the primary
      primary = idx;
      failStreak = 0;
      return maybe;
    }
  }

  // All enabled endpoints failed this round
  failStreak += 1;
  if (failStreak >= FAIL_THRESHOLD) {
    primary = (primary + 1) % enabledEndpoints.length; // shift to next endpoint
    failStreak = 0;
  }
  return null;
}

// New function to handle line breaks by translating each line separately
async function doTranslateWithLineBreaks(text: string, targetLang: string): Promise<string | null> {
  // If text has no line breaks, use original function
  if (!text.includes('\n')) {
    return await doTranslate(text, targetLang);
  }
  
  
  // Split text by line breaks - this ensures every \n creates a new line
  const lines = text.split('\n');
  const translatedLines: string[] = [];
  
  
  // Translate each line separately
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === '') {
      // Preserve empty lines
      translatedLines.push('');
    } else {
      try {
        const translatedLine = await doTranslateLine(line, targetLang);
        if (translatedLine !== null) {
          translatedLines.push(translatedLine);
        } else {
          // If translation fails, keep original line
          translatedLines.push(line);
        }
      } catch (error) {
        // If translation fails, keep original line
        translatedLines.push(line);
      }
    }
  }
  
  // Join translated lines with line breaks
  const finalTranslated = translatedLines.join('\n');
  
  
  return finalTranslated;
}

// Helper function to escape regular expression special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export function translateText(text: string, targetLang: string): Promise<string | null> {
  const cacheKey = `${targetLang}:${text}`;
  if (cache.has(cacheKey)) {
    return Promise.resolve(cache.get(cacheKey)!);
  }
  
  
  const next = chain.then(async () => {
    const res = await doTranslateWithLineBreaks(text, targetLang);
    if (res !== null) {
      cache.set(cacheKey, res);
      saveCache();
    } else {
    }
    // small delay between requests to avoid hitting quota hard
    await new Promise((r) => setTimeout(r, 300));
    return res;
  });
  // update chain but swallow result so the queue never rejects
  chain = next.then(
    () => {},
    () => {}
  );
  return next;
}


function handleResult(maybeJson: string | null, text: string): string | null {
  if (typeof maybeJson === "string") {
    return preserveBlankLines(text, maybeJson);
  }
  return maybeJson;
}

function handleResultRaw(maybeJson: string | null): string | null {
  // Return the raw result without preserveBlankLines processing
  return maybeJson;
}

async function safeParse(res: Response): Promise<string | null> {
  try {
    const txt = await res.text();
    if (!txt) return null;

    // Heuristic to detect if the response is HTML, which is unexpected.
    // It might be a fallback page from a proxy or a misconfigured endpoint.
    if (txt.trim().startsWith("<") && txt.includes("html")) {
      return null; // Ignore HTML responses
    }

    let raw: string | null = null;
    try {
      // Prefer JSON parsing
      const obj = JSON.parse(txt);
      
      // Handle new API format with code field: {"code":200,"text":"こんにちは"}
      if (obj.code === 200 && obj.text) {
        raw = obj.text;
      } else if (obj.code && obj.code !== 200) {
        // Handle error responses with code field
        return null;
      } else {
        // Handle original API format: {"text":"こんにちは"}
        const maybeText = obj.translatedText || obj.text || obj.translation || null;
        if (typeof maybeText === "string") {
          raw = maybeText;
        } else {
          return maybeText;
        }
      }
    } catch {
      // Fallback for non-JSON responses
      raw = txt;
    }

    if (raw) {
      // First, decode common HTML entities that might be in a plain text response
      const decoded = raw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

      // Normalize newlines and <br> tags, then strip any remaining HTML tags.
      const cleaned = decoded
        .replace(/\\n/g, "\n") // unescape \n
        .replace(/<br\s*\/?>/gi, "\n") // <br> to newline
        .replace(/<\/p>\s*<p>/gi, "\n\n") // paragraph breaks
        .replace(/<[^>]*>/g, "") // strip all other tags
        .replace(/\r\n/g, "\n") // normalize Windows line endings
        .replace(/\r/g, "\n") // normalize Mac line endings
        .trim();

      return cleaned;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// keep blank-line count same as source
function preserveBlankLines(src: string, dest: string): string {
  const s = src.split("\n");
  const d = dest.split("\n");
  const out: string[] = [];
  let j = 0;
  
  // If source and destination have similar line counts, preserve structure
  if (Math.abs(s.length - d.length) <= 1) {
    for (let i = 0; i < s.length; i++) {
      if (s[i].trim() === "") {
        out.push("");
        if (d[j]?.trim() === "") j++;
      } else {
        out.push(d[j] ?? "");
        j++;
      }
    }
    while (j < d.length) out.push(d[j++]);
  } else {
    // If line counts are very different, just preserve the translated structure
    // but ensure we maintain at least some line break structure
    for (let i = 0; i < s.length; i++) {
      if (s[i].trim() === "") {
        out.push("");
      } else if (j < d.length) {
        out.push(d[j]);
        j++;
      }
    }
    // Add any remaining translated lines
    while (j < d.length) out.push(d[j++]);
  }
  
  return out.join("\n");
}
