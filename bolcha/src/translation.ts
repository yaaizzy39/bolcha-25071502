// Utility to call custom GAS translation API endpoints in a round-robin fashion
// GAS endpoint list is provided via `VITE_GAS_ENDPOINTS` (comma-separated URLs)

const endpoints = (import.meta.env.VITE_GAS_ENDPOINTS as string | undefined)
  ?.split(/[, ]+/)
  .filter(Boolean) ?? [];

let cursor = 0;

export async function translateText(text: string, targetLang: string): Promise<string | null> {
  if (!endpoints.length) {
    console.warn("No GAS endpoints configured");
    return null;
  }
  // Pick endpoint round-robin
  const url = endpoints[cursor % endpoints.length];
  cursor += 1;

  try {
    // attempt POST (preferred)
    const postRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetLang }),
    });
    if (postRes.ok) {
      const maybeJson = await safeParse(postRes);
      return handleResult(maybeJson, text);
    }
  } catch {}

  // fallback: GET (no preflight)
  try {
    const params = new URLSearchParams({ text, target: targetLang });
    const getRes = await fetch(`${url}?${params.toString()}`);
    if (!getRes.ok) throw new Error("Non-200 response");
    const maybeJson = await safeParse(getRes);
    return handleResult(maybeJson, text);
  } catch (err) {
    console.error("Translate error", err);
    return null;
  }
}

function handleResult(maybeJson: string | null, text: string): string | null {
  if (typeof maybeJson === "string") {
    return preserveBlankLines(text, maybeJson);
  }
  return maybeJson;
}

async function safeParse(res: Response): Promise<string | null> {
  try {
    const txt = await res.text();
    if (!txt) return null;
    try {
      const obj = JSON.parse(txt);
      // tolerate different property names
      const raw = obj.translatedText || obj.text || obj.translation || null;
      if (typeof raw === "string") {
        const normalized = raw.replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n");
        return normalized;
      }
      return raw;
    } catch {
      return txt.replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n"); // plain text with normalized breaks
    }
  } catch {
    return null;
  }
}

// keep blank-line count same as source
function preserveBlankLines(src: string, dest: string): string {
  const s = src.split("\n");
  const d = dest.split("\n");
  const out: string[] = [];
  let j = 0;
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
  return out.join("\n");
}
